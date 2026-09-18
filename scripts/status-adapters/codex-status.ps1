param(
    [string]$ConfigPath = "$env:LOCALAPPDATA\Ascend\status-adapters\codex-local-1\config.json",
    [string]$CodexExecutable = "$env:APPDATA\npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe",
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$CodexArguments
)
$ErrorActionPreference = 'Stop'
$launcherPath = Join-Path $PSScriptRoot 'codex-launch.mjs'
& D:\node.exe --no-warnings $launcherPath $ConfigPath $CodexExecutable @CodexArguments
