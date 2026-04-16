# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY web/package.json web/package-lock.json ./
COPY web/prisma ./prisma/
COPY web/prisma.config.ts ./
RUN npm ci --ignore-scripts

FROM base AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY web/. .
ENV SKIP_ENV_VALIDATION=1
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public
RUN npx prisma generate
RUN npm run build

#本番イメージ内でだけ migrate deploy 用の最小 CLI（standalone には prismaバイナリが含まれない）
FROM base AS migrate-tool
WORKDIR /migrate
COPY web/prisma ./prisma
COPY web/prisma.config.ts ./
RUN echo '{"private":true,"dependencies":{"prisma":"7.6.0","dotenv":"17.3.1"}}' > package.json \
  && npm install

FROM base AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=migrate-tool --chown=nextjs:nodejs /migrate /migrate
COPY web/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh && chown nextjs:nodejs /app/docker-entrypoint.sh

WORKDIR /app
USER nextjs
EXPOSE 8080
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["/app/docker-entrypoint.sh"]

