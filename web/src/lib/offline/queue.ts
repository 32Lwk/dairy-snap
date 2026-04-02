import { openDB, type DBSchema, type IDBPDatabase } from "idb";

type PendingAppend = {
  id: string;
  entryDateYmd: string;
  fragment: string;
  mood?: string;
  createdAt: number;
};

interface SnapQueueSchema extends DBSchema {
  pending: {
    key: string;
    value: PendingAppend;
  };
}

let dbPromise: Promise<IDBPDatabase<SnapQueueSchema>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<SnapQueueSchema>("daily-snap-queue", 1, {
      upgrade(db) {
        db.createObjectStore("pending", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export async function enqueueAppend(input: {
  entryDateYmd: string;
  fragment: string;
  mood?: string;
}) {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.put("pending", {
    id,
    entryDateYmd: input.entryDateYmd,
    fragment: input.fragment,
    mood: input.mood,
    createdAt: Date.now(),
  });
  return id;
}

export async function flushAppendQueue(): Promise<{ ok: number; failed?: string }> {
  const db = await getDb();
  const all = await db.getAll("pending");
  all.sort((a, b) => a.createdAt - b.createdAt);
  let ok = 0;
  for (const item of all) {
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entryDateYmd: item.entryDateYmd,
        fragment: item.fragment,
        ...(item.mood ? { mood: item.mood } : {}),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ok,
        failed: typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
      };
    }
    await db.delete("pending", item.id);
    ok += 1;
  }
  return { ok };
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  return db.count("pending");
}
