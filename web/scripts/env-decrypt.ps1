<#
Decrypt web/.env.age to web/.env using age identity key.

This script:
- reads identity from web/.age/identity.txt
- reads encrypted input from web/.env.age
- writes decrypted output to web/.env
#>

[CmdletBinding()]
param(
  [string]$AgeFile = (Join-Path (Split-Path -Parent $PSScriptRoot) ".env.age"),
  [string]$EnvOutFile = (Join-Path (Split-Path -Parent $PSScriptRoot) ".env"),
  [string]$IdentityFile = (Join-Path (Split-Path -Parent $PSScriptRoot) ".age\identity.txt"),
  [switch]$KeepBackup
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Test-AgeCli {
  if (-not (Get-Command age -ErrorAction SilentlyContinue)) {
    throw "age CLIが見つかりません。PATHを通した上で 'age --version' を実行してください。"
  }
}

Test-AgeCli

if (-not (Test-Path -LiteralPath $AgeFile)) {
  throw "暗号化ファイルが見つかりません: $AgeFile"
}

if (-not (Test-Path -LiteralPath $IdentityFile)) {
  throw "秘密鍵(identity.txt)が見つかりません: $IdentityFile"
}

if ((Test-Path -LiteralPath $EnvOutFile) -and (-not $KeepBackup)) {
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupPath = "$EnvOutFile.bak.$timestamp"
  Move-Item -Force -LiteralPath $EnvOutFile -Destination $backupPath
  Write-Host "既存 .env を退避しました: $backupPath"
}

& age -d -i $IdentityFile -o $EnvOutFile $AgeFile
Write-Host "復号完了: $EnvOutFile"

