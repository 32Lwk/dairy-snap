import { CompactEncrypt, compactDecrypt, decodeProtectedHeader } from "jose";
import { base64url } from "jose";
import { scryptSync, randomBytes } from "node:crypto";
import {
  BUNDLE_SCHEMA_VERSION,
  MAX_BUNDLE_PLAINTEXT_BYTES,
  bundleDataSchema,
  transferContainerHeaderSchema,
  type BundleData,
  type TransferContainerHeader,
} from "@/lib/account-transfer/bundle-schema";

const HEADER_LEN_BYTES = 4;
/**
 * jose@6 の webapi build は PBES2 系の JWE alg を実装していないため、
 * alg=dir + A256GCM で暗号化し、鍵は passphrase+salt から scrypt で導出する。
 */
const DIR_ALG = "dir" as const;
const ENC = "A256GCM" as const;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

export type BundleBlob = {
  sourceStorageKey: string;
  bytes: Uint8Array;
  mimeType: string;
  sha256: string;
};

function deriveKey(passphrase: string, salt: Uint8Array): Uint8Array {
  // Node.js 側で scrypt を使って鍵を導出（CPU/メモリコストはデフォルト）
  const key = scryptSync(passphrase, salt, KEY_BYTES);
  return new Uint8Array(key.buffer, key.byteOffset, key.byteLength);
}

/**
 * バンドルを暗号化（パスフレーズで JWE 化）。
 * 戻り値は JWE Compact Serialization 文字列（拡張子 .dsbundle として保存）。
 */
export async function encryptBundle(
  data: BundleData,
  blobs: BundleBlob[],
  passphrase: string,
): Promise<string> {
  const dataJson = new TextEncoder().encode(JSON.stringify(data));
  const header: TransferContainerHeader = {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    dataLen: dataJson.byteLength,
    blobs: blobs.map((b) => ({
      sourceStorageKey: b.sourceStorageKey,
      length: b.bytes.byteLength,
      mimeType: b.mimeType,
      sha256: b.sha256,
    })),
  };
  const headerJson = new TextEncoder().encode(JSON.stringify(header));

  const totalLen = HEADER_LEN_BYTES + headerJson.byteLength + dataJson.byteLength +
    blobs.reduce((s, b) => s + b.bytes.byteLength, 0);
  if (totalLen > MAX_BUNDLE_PLAINTEXT_BYTES) {
    throw new BundleTooLargeError(totalLen);
  }

  const buf = new Uint8Array(totalLen);
  const view = new DataView(buf.buffer);
  view.setUint32(0, headerJson.byteLength, false);
  buf.set(headerJson, HEADER_LEN_BYTES);
  let offset = HEADER_LEN_BYTES + headerJson.byteLength;
  buf.set(dataJson, offset);
  offset += dataJson.byteLength;
  for (const b of blobs) {
    buf.set(b.bytes, offset);
    offset += b.bytes.byteLength;
  }

  const salt = randomBytes(SALT_BYTES);
  const key = deriveKey(passphrase, salt);
  const jwe = await new CompactEncrypt(buf)
    .setProtectedHeader({
      alg: DIR_ALG,
      enc: ENC,
      // custom header: salt
      s: base64url.encode(salt),
      v: 1,
    })
    .encrypt(key);
  return jwe;
}

export type DecryptedBundle = {
  data: BundleData;
  blobs: Map<string, { bytes: Uint8Array; mimeType: string; sha256: string }>;
};

/**
 * バンドル（JWE compact serialization）を復号して中身を返す。
 * パスフレーズが違う/改ざん/壊れている場合は例外。
 */
export async function decryptBundle(
  jwe: string,
  passphrase: string,
): Promise<DecryptedBundle> {
  let salt: Uint8Array;
  try {
    const h = decodeProtectedHeader(jwe) as { s?: unknown };
    if (typeof h.s !== "string" || h.s.length < 8) {
      throw new Error("missing salt");
    }
    salt = base64url.decode(h.s);
  } catch (e) {
    throw new BundleFormatError(
      `protected header invalid: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const key = deriveKey(passphrase, salt);

  let plaintext: Uint8Array;
  try {
    const result = await compactDecrypt(jwe, key);
    plaintext = result.plaintext;
  } catch (e) {
    throw new BundleDecryptError(
      e instanceof Error ? e.message : String(e),
    );
  }

  if (plaintext.byteLength < HEADER_LEN_BYTES) {
    throw new BundleFormatError("plaintext too short");
  }
  if (plaintext.byteLength > MAX_BUNDLE_PLAINTEXT_BYTES) {
    throw new BundleTooLargeError(plaintext.byteLength);
  }

  const view = new DataView(
    plaintext.buffer,
    plaintext.byteOffset,
    plaintext.byteLength,
  );
  const headerLen = view.getUint32(0, false);
  if (headerLen <= 0 || headerLen > 1_000_000) {
    throw new BundleFormatError(`invalid header length: ${headerLen}`);
  }
  const headerStart = HEADER_LEN_BYTES;
  const headerEnd = headerStart + headerLen;
  if (headerEnd > plaintext.byteLength) {
    throw new BundleFormatError("header overruns plaintext");
  }

  const headerJson = new TextDecoder().decode(
    plaintext.subarray(headerStart, headerEnd),
  );
  let headerObj: unknown;
  try {
    headerObj = JSON.parse(headerJson);
  } catch (e) {
    throw new BundleFormatError(
      `header JSON invalid: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const header = transferContainerHeaderSchema.parse(headerObj);

  const dataStart = headerEnd;
  const dataEnd = dataStart + header.dataLen;
  if (dataEnd > plaintext.byteLength) {
    throw new BundleFormatError("data section overruns plaintext");
  }
  const dataJson = new TextDecoder().decode(plaintext.subarray(dataStart, dataEnd));
  let dataObj: unknown;
  try {
    dataObj = JSON.parse(dataJson);
  } catch (e) {
    throw new BundleFormatError(
      `data JSON invalid: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const data = bundleDataSchema.parse(dataObj);

  let cursor = dataEnd;
  const blobs = new Map<string, { bytes: Uint8Array; mimeType: string; sha256: string }>();
  for (const b of header.blobs) {
    const end = cursor + b.length;
    if (end > plaintext.byteLength) {
      throw new BundleFormatError(`blob overruns plaintext: ${b.sourceStorageKey}`);
    }
    blobs.set(b.sourceStorageKey, {
      bytes: plaintext.subarray(cursor, end),
      mimeType: b.mimeType,
      sha256: b.sha256,
    });
    cursor = end;
  }

  return { data, blobs };
}

export class BundleDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleDecryptError";
  }
}

export class BundleFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleFormatError";
  }
}

export class BundleTooLargeError extends Error {
  constructor(byteLength: number) {
    super(`bundle too large: ${byteLength} bytes (max ${MAX_BUNDLE_PLAINTEXT_BYTES})`);
    this.name = "BundleTooLargeError";
  }
}
