# Local `.env` Encryption (age)

このプロジェクトでは、`web/.env`（APIキー等の秘密情報）をGitで共有せずに、LINEやメモ帳で「暗号文だけ」をやり取りできるようにするための仕組みを用意しています。

## 方式
- 暗号化: `age` の公開鍵（recipient）で `web/.env` を `web/.env.age` に暗号化
- 復号: 各端末の秘密鍵（identity）で `web/.env.age` を `web/.env` に復号

## 重要
- `web/.age/identity.txt`（秘密鍵）をLINE/メモ帳/GitHubに共有しないでください。
- 復号後にできる `web/.env` は端末上の一時的な平文です。必要がなくなったら削除してください。
- すでに平文の `.env` を共有してしまっている場合は、各サービスのキー/`AUTH_SECRET` などをローテーションしてください。

## 事前準備
1. `age` CLI をインストールして `PATH` を通してください（例: `age --version` が通ること）。
2. 共有用ファイル `web/env/age/recipients.txt` と、秘密鍵置き場 `web/.age/` がこの通りの場所にあることを確認してください。

## 鍵の準備（端末ごとに実施）
各端末（端末A/端末Bなど）で以下を実施します。

1. `web` ディレクトリへ移動
   - PowerShell: `cd web`
2. 秘密鍵を生成（秘密鍵はこのファイルに出力されます）
   - `age-keygen -o .age\identity.txt`
3. 公開鍵を取得して `recipients.txt` に追記
   - 取得: `age-keygen -y .age\identity.txt`
   - 追記: 表示された `age1...` を `web/env/age/recipients.txt` の末尾に 1行追加

## 暗号化（暗号文の作成）
1. `cd web`
2. 暗号化:
   - `.\scripts\env-encrypt.ps1`
3. 出力:
   - `web/.env.age`（これをLINE/メモ帳で共有します）

## 復号（開発を再開）
1. `cd web`
2. 共有して受け取った `web/.env.age` を配置
3. 復号:
   - `.\scripts\env-decrypt.ps1`
4. これで `web/.env` が生成されます。`npm run dev` を起動してください。

## 追加のnpmスクリプト（任意）
`web/package.json` には以下も用意しています。
- `npm run env:encrypt` （暗号化）
- `npm run env:decrypt` （復号）

