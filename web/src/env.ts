import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const _env = createEnv({
  skipValidation:
    process.env.SKIP_ENV_VALIDATION === "1" ||
    process.env.SKIP_ENV_VALIDATION === "true",
  server: {
    AUTH_SECRET: z.string().min(1),
    /** Canonical site URL (e.g. https://snap.yutok.dev). Recommended behind Cloud Run / reverse proxies. */
    AUTH_URL: z.string().url().optional(),
    /** Set to `1` to enable Auth.js debug logs (temporary production troubleshooting). */
    AUTH_DEBUG: z.string().optional(),
    AUTH_GOOGLE_ID: z.string().min(1),
    AUTH_GOOGLE_SECRET: z.string().min(1),
    AUTH_APPLE_ID: z.string().min(1).optional(),
    AUTH_APPLE_SECRET: z.string().min(1).optional(),
    /** GitHub OAuth App（連携未使用時は未設定可） */
    AUTH_GITHUB_ID: z.string().min(1).optional(),
    AUTH_GITHUB_SECRET: z.string().min(1).optional(),
    /** 日次 GitHub 同期 Cron（Cloud Scheduler 等）。`Authorization: Bearer <secret>` */
    GITHUB_SYNC_CRON_SECRET: z.string().min(1).optional(),
    /**
     * open: any Google user who signs in is allowed (ALLOWED_EMAILS ignored).
     * allowlist: comma-separated ALLOWED_EMAILS, or * / ALL for everyone (legacy).
     */
    AUTH_ACCESS_MODE: z.preprocess(
      (val) => (val === "" || val === undefined || val === null ? "allowlist" : val),
      z.enum(["allowlist", "open"]),
    ),
    ALLOWED_EMAILS: z.string().default(""),
    DATABASE_URL: z.string().url(),
    UPLOADS_DIR: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1).optional(),
    /** Vertex / Enterprise Gemini（@google/genai）。未設定でもビルド可。 */
    GOOGLE_GENAI_USE_ENTERPRISE: z.string().optional(),
    GOOGLE_CLOUD_PROJECT: z.string().optional(),
    GOOGLE_CLOUD_LOCATION: z.string().optional(),
    HOBBY_GROUNDING_MODEL: z.string().optional(),
    VERTEX_GEMINI_GROUNDING_MODEL: z.string().optional(),
    HOBBY_FETCH_USER_AGENT: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_ORIGIN: z.string().url(),
  },
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    AUTH_DEBUG: process.env.AUTH_DEBUG,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    AUTH_APPLE_ID: process.env.AUTH_APPLE_ID,
    AUTH_APPLE_SECRET: process.env.AUTH_APPLE_SECRET,
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
    GITHUB_SYNC_CRON_SECRET: process.env.GITHUB_SYNC_CRON_SECRET,
    AUTH_ACCESS_MODE: process.env.AUTH_ACCESS_MODE,
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
    DATABASE_URL: process.env.DATABASE_URL,
    UPLOADS_DIR: process.env.UPLOADS_DIR,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GOOGLE_GENAI_USE_ENTERPRISE: process.env.GOOGLE_GENAI_USE_ENTERPRISE,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
    HOBBY_GROUNDING_MODEL: process.env.HOBBY_GROUNDING_MODEL,
    VERTEX_GEMINI_GROUNDING_MODEL: process.env.VERTEX_GEMINI_GROUNDING_MODEL,
    HOBBY_FETCH_USER_AGENT: process.env.HOBBY_FETCH_USER_AGENT,
    NEXT_PUBLIC_APP_ORIGIN: process.env.NEXT_PUBLIC_APP_ORIGIN,
  },
});

if (_env.AUTH_ACCESS_MODE === "allowlist" && _env.ALLOWED_EMAILS.trim() === "") {
  throw new Error(
    "When AUTH_ACCESS_MODE=allowlist, set ALLOWED_EMAILS (comma-separated emails, or * / ALL).",
  );
}

export const env = _env;
