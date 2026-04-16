import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
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
    ALLOWED_EMAILS: z.string().min(1),
    DATABASE_URL: z.string().url(),
    UPLOADS_DIR: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1).optional(),
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
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
    DATABASE_URL: process.env.DATABASE_URL,
    UPLOADS_DIR: process.env.UPLOADS_DIR,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    NEXT_PUBLIC_APP_ORIGIN: process.env.NEXT_PUBLIC_APP_ORIGIN,
  },
});

