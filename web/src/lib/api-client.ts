/**
 * React Native 等から再利用しやすいよう、fetch の薄いラッパー（MVP）
 */

export type ApiError = { error: string; status: number };

export async function apiJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; err: ApiError }> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    return {
      ok: false,
      err: { status: res.status, error: typeof data.error === "string" ? data.error : res.statusText },
    };
  }
  return { ok: true, data: data as T };
}
