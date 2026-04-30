import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  /** Workbox が同一オリジンの /api を StaleWhileRevalidate 等で保持しないよう最優先でネットワークのみ */
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
      },
    ],
  },
});

const nextConfig: NextConfig = {
  output: "standalone",
  /** @google-cloud/tasks は実行時に JSON を require するため、Webpack バンドルから外す */
  serverExternalPackages: ["@google-cloud/tasks"],
  /**
   * `@google-cloud/tasks` は実行時に JSON を `require()` する。
   * standalone の file tracing で JSON が落ちると Cloud Run で MODULE_NOT_FOUND になるため、
   * 必要な JSON を明示的に同梱させる。
   */
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@google-cloud/tasks/build/esm/src/v2/cloud_tasks_client_config.json",
      "./node_modules/@google-cloud/tasks/build/esm/src/v2beta2/cloud_tasks_client_config.json",
      "./node_modules/@google-cloud/tasks/build/esm/src/v2beta3/cloud_tasks_client_config.json",
    ],
  },
};

export default withPWA(nextConfig);
