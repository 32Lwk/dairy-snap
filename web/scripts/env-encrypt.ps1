<#
Encrypt web/.env to web/.env.age using age (recipient public keys).

This script:
- reads recipients from web/env/age/recipients.txt
- writes encrypted output to web/.env.age
#>

[CmdletBinding()]
param(
  [string]$EnvFile = (Join-Path (Split-Path -Parent $PSScriptRoot) ".env"),
  [string]$AgeOutFile = (Join-Path (Split-Path -Parent $PSScriptRoot) ".env.age"),
  [string]$RecipientsFile = (Join-Path (Split-Path -Parent $PSScriptRoot) "env\age\recipients.txt")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Test-AgeCli {
  if (-not (Get-Command age -ErrorAction SilentlyContinue)) {
    throw "age CLIが見つかりません。PATHを通した上で 'age --version' を実行してください。"
  }
}

Test-AgeCli

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "暗号化元の .env が見つかりません: $EnvFile"
}

if (-not (Test-Path -LiteralPath $RecipientsFile)) {
  throw "公開鍵の recipients.txt が見つかりません: $RecipientsFile"
}

# Filter only valid age recipient lines (so comments/blank lines are allowed).
$recipientLines = Get-Content -LiteralPath $RecipientsFile -ErrorAction Stop |
  ForEach-Object { $_.Trim() } |
  Where-Object { $_ -ne "" -and ($_ -match '^age1[0-9a-z]+$') }

if (-not $recipientLines -or $recipientLines.Count -lt 1) {
  throw "recipients.txt に age 公開鍵（age1...）が含まれていません: $RecipientsFile"
}

$tmpRecipients = Join-Path $env:TEMP ("daily-snap-age-recipients-" + [guid]::NewGuid().ToString() + ".txt")
$needCleanup = $true

try {
  Set-Content -LiteralPath $tmpRecipients -Value $recipientLines -NoNewline
  if (Test-Path -LiteralPath $AgeOutFile) {
    Remove-Item -Force -LiteralPath $AgeOutFile
  }

  & age -R $tmpRecipients -o $AgeOutFile $EnvFile
  Write-Host "暗号化完了: $AgeOutFile"
}
finally {
  if ($needCleanup -and (Test-Path -LiteralPath $tmpRecipients)) {
    Remove-Item -Force -LiteralPath $tmpRecipients -ErrorAction SilentlyContinue
  }
}

