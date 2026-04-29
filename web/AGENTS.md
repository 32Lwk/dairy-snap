<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI Conventions

- `select`: ネイティブの`<select>`は使用しない（OS/ブラウザ依存のドロップダウンになり、見た目が統一できないため）
- `FancySelect`: `@/components/fancy-select` の `FancySelect` を使う
