import fs from "node:fs/promises";
import path from "node:path";
import type { ObjectStorage, PutObjectInput } from "@/server/storage/types";

function rootDir() {
  const raw = process.env.UPLOADS_DIR ?? "../.uploads";
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

export function createLocalObjectStorage(): ObjectStorage {
  return {
    async put(input: PutObjectInput) {
      const full = path.join(rootDir(), input.key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, input.body);
    },
    async get(key: string) {
      const full = path.join(rootDir(), key);
      try {
        return await fs.readFile(full);
      } catch {
        return null;
      }
    },
    async delete(key: string) {
      const full = path.join(rootDir(), key);
      try {
        await fs.unlink(full);
      } catch {
        /* ignore */
      }
    },
  };
}

let singleton: ObjectStorage | null = null;

export function getObjectStorage(): ObjectStorage {
  if (!singleton) singleton = createLocalObjectStorage();
  return singleton;
}
