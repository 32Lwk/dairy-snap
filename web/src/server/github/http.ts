import { scheduleAppLog, AppLogScope } from "@/lib/server/app-log";

const DEFAULT_UA = "daily-snap/1.0 (GitHub integration)";

export type GithubFetchResult<T> = {
  ok: true;
  data: T;
  status: number;
  etag?: string;
} | {
  ok: false;
  status: number;
  message: string;
  rateLimited?: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function githubFetchJson<T>(
  url: string,
  accessToken: string,
  opts?: {
    method?: string;
    body?: unknown;
    etag?: string | null;
    accept?: string;
  },
): Promise<GithubFetchResult<T>> {
  const headers: Record<string, string> = {
    Accept: opts?.accept ?? "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": process.env.HOBBY_FETCH_USER_AGENT?.trim() || DEFAULT_UA,
  };
  if (opts?.etag) headers["If-None-Match"] = opts.etag;

  let attempt = 0;
  const maxAttempts = 4;
  let backoffMs = 800;

  while (attempt < maxAttempts) {
    attempt += 1;
    const res = await fetch(url, {
      method: opts?.method ?? "GET",
      headers: {
        ...headers,
        ...(opts?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });

    const status = res.status;
    const rateLimited = status === 403 || status === 429;

    if (status === 304) {
      return { ok: true, data: undefined as T, status: 304, etag: opts?.etag ?? undefined };
    }

    if (rateLimited && attempt < maxAttempts) {
      const reset = res.headers.get("x-ratelimit-reset");
      const retryAfter = res.headers.get("retry-after");
      const wait =
        retryAfter != null
          ? Math.min(60_000, Number(retryAfter) * 1000 || backoffMs)
          : reset != null
            ? Math.max(0, Number(reset) * 1000 - Date.now())
            : backoffMs;
      scheduleAppLog(AppLogScope.github, "warn", "github_rate_limit_backoff", {
        url: url.replace(/\?.*/, ""),
        attempt,
        waitMs: wait,
      });
      await sleep(Math.min(60_000, Math.max(backoffMs, wait)));
      backoffMs *= 2;
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        status,
        message: text.slice(0, 500),
        rateLimited,
      };
    }

    if (res.status === 204) {
      return { ok: true, data: undefined as T, status };
    }

    const etagOut = res.headers.get("etag") ?? undefined;
    let data: T;
    try {
      data = (await res.json()) as T;
    } catch {
      return { ok: false, status, message: "invalid_json_body" };
    }
    return { ok: true, data, status, etag: etagOut };
  }

  return { ok: false, status: 429, message: "max_retries", rateLimited: true };
}
