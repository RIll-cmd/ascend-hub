param(
    [string]$ConfigPath = 'D:\ascend-status-adapters\antigravity-cli\antigravity-local-1\config.json',
    [string]$AntigravityExecutable = "$env:LOCALAPPDATA\agy\bin\agy.exe",
    [string]$Workspace = (Get-Location).Path,
    [switch]$InstallHooks,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$AntigravityArguments
)
$ErrorActionPreference = 'Stop'
$launcherPath = Join-Path $PSScriptRoot 'antigravity-launch.mjs'
if ($InstallHooks) { $AntigravityArguments = @('--install-hooks') }
& D:\node.exe --no-warnings $launcherPath $ConfigPath $AntigravityExecutable $Workspace @AntigravityArguments
