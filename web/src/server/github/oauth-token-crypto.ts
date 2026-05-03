import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "@/env";

const SALT = "daily-snap:oauth-token:v1";

function deriveKey(): Buffer {
  return scryptSync(env.AUTH_SECRET, SALT, 32);
}

/** AES-256-GCM: base64(iv 12B + tag 16B + ciphertext) */
export function encryptOAuthSecretPayload(plain: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptOAuthSecretPayload(b64: string): string {
  const key = deriveKey();
  const buf = Buffer.from(b64, "base64url");
  if (buf.length < 12 + 16 + 1) throw new Error("invalid_payload");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
