#!/bin/sh
set -e
# Cloud Run 等で DATABASE_URL が渡された本番 DB にマイグレーションを適用してから Next を起動する
if [ -z "$DATABASE_URL" ]; then
  echo "docker-entrypoint: DATABASE_URL is not set; skipping migrations" >&2
  exec node server.js
fi
cd /migrate
node node_modules/prisma/build/index.js migrate deploy
cd /app
exec node server.js
