#!/bin/sh
set -e
# Cloud Run 等で DATABASE_URL が渡された本番 DB にマイグレーションを適用してから Next を起動する。
# ただし、Cloud Run は「PORT で listen できない」= 起動失敗扱いになるため、
# マイグレーション失敗でサーバ起動まで到達できない状況を避ける（起動は優先しログに残す）。

if [ -n "$DATABASE_URL" ]; then
  echo "docker-entrypoint: DATABASE_URL is set; attempting migrations..." >&2
  set +e
  (
    cd /migrate \
      && node node_modules/prisma/build/index.js migrate deploy
  )
  migrate_exit_code=$?
  set -e

  if [ $migrate_exit_code -ne 0 ]; then
    echo "docker-entrypoint: prisma migrate deploy failed (exit=$migrate_exit_code); starting server anyway" >&2
  else
    echo "docker-entrypoint: prisma migrate deploy succeeded" >&2
  fi
else
  echo "docker-entrypoint: DATABASE_URL is not set; skipping migrations" >&2
fi

cd /app
exec node server.js
