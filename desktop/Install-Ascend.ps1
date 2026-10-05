#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$HubRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$VisionRoot,
    [string]$NodeExe,
    [string]$PythonExe,
    [string]$VisionConfig,
    [string]$VisionEnvFile,
    [string]$DestinationRoot = (Join-Path $env:LOCALAPPDATA 'Ascend\Desktop'),
    [string]$ShortcutDirectory = [Environment]::GetFolderPath('DesktopDirectory'),
    [switch]$SkipShortcuts,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Resolve-RequiredFile([string]$path, [string]$description) {
    if ([string]::IsNullOrWhiteSpace($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "$description is missing. Supply its absolute path."
    }
    return (Resolve-Path -LiteralPath $path).ProviderPath
}

function Resolve-RequiredDirectory([string]$path, [string]$description) {
    if ([string]::IsNullOrWhiteSpace($path) -or -not (Test-Path -LiteralPath $path -PathType Container)) {
        throw "$description is missing. Supply its absolute path."
    }
    return (Resolve-Path -LiteralPath $path).ProviderPath
}

$HubRoot = Resolve-RequiredDirectory $HubRoot 'Hub checkout'
if (-not $VisionRoot) {
    $VisionRoot = Join-Path (Split-Path -Parent $HubRoot) 'ascend-vision\ascend-vision'
}
$VisionRoot = Resolve-RequiredDirectory $VisionRoot 'Vision checkout'
if (-not $NodeExe) {
    $command = Get-Command node -ErrorAction SilentlyContinue
    if ($command) { $NodeExe = $command.Source }
}
if (-not $PythonExe) { $PythonExe = Join-Path $VisionRoot '.venv\Scripts\python.exe' }
if (-not $VisionConfig) { $VisionConfig = Join-Path $VisionRoot 'config.yaml' }
if (-not $VisionEnvFile) { $VisionEnvFile = Join-Path $VisionRoot '.env' }
$NodeExe = Resolve-RequiredFile $NodeExe 'Node executable'
$PythonExe = Resolve-RequiredFile $PythonExe 'Vision Python executable'
$VisionEnvFile = Resolve-RequiredFile $VisionEnvFile 'Vision owner-managed env file'
$visionConfig = Resolve-RequiredFile $VisionConfig 'Vision config'
[void](Resolve-RequiredFile (Join-Path $HubRoot 'node_modules\vinext\dist\cli.js') 'Hub local runtime')
[void](Resolve-RequiredFile (Join-Path $VisionRoot 'fairy-ui\dist\index.html') 'Fairy UI build')
[void](Resolve-RequiredFile (Join-Path $VisionRoot 'desktop_host.py') 'Vision recovery host')

$DestinationRoot = [System.IO.Path]::GetFullPath($DestinationRoot)
$profilePath = Join-Path $DestinationRoot 'profile.json'
if ((Test-Path -LiteralPath $profilePath) -and -not $Force) {
    throw 'Ascend profile already exists. Re-run with -Force only after reviewing the selected checkout paths.'
}

$profile = [ordered]@{
    schemaVersion = 1
    hub = [ordered]@{
        root = $HubRoot; executable = $NodeExe; buildId = 'local-development'
        runtime = 'development'; port = 5173; startupSeconds = 90
    }
    vision = [ordered]@{
        root = $VisionRoot; executable = $PythonExe; buildId = 'local-development'
        config = $visionConfig; envFile = $VisionEnvFile; startupSeconds = 180
    }
}

[void][System.IO.Directory]::CreateDirectory($DestinationRoot)
$temporaryPath = Join-Path $DestinationRoot ('.profile-' + [guid]::NewGuid().ToString('N') + '.tmp')
try {
    [System.IO.File]::WriteAllText($temporaryPath, ($profile | ConvertTo-Json -Depth 5),
        [System.Text.Encoding]::UTF8)
    if (Test-Path -LiteralPath $profilePath) {
        $backupPath = Join-Path $DestinationRoot ('profile-backup-' +
            [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff') + '.json')
        try {
            [System.IO.File]::Replace($temporaryPath, $profilePath, $backupPath)
        } catch {
            if ($_.Exception.GetBaseException() -isnot [System.UnauthorizedAccessException]) {
                throw
            }
            # Windows EFS can deny Replace even when this owner may copy the
            # encrypted files. Preserve the old profile before overwriting it.
            [System.IO.File]::Copy($profilePath, $backupPath, $false)
            [System.IO.File]::Copy($temporaryPath, $profilePath, $true)
        }
    } else {
        [System.IO.File]::Move($temporaryPath, $profilePath)
    }
} finally {
    if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath }
}

if (-not $SkipShortcuts) {
    [void][System.IO.Directory]::CreateDirectory($ShortcutDirectory)
    $shell = New-Object -ComObject WScript.Shell
    $launcherPath = Join-Path $PSScriptRoot 'Start-Ascend.ps1'
    foreach ($name in @('Vision', 'Hub')) {
        $shortcut = $shell.CreateShortcut((Join-Path $ShortcutDirectory "Ascend $name.lnk"))
        $shortcut.TargetPath = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
        $shortcut.Arguments = "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcherPath`" -Target $name -ProfilePath `"$profilePath`""
        $shortcut.WorkingDirectory = $HubRoot
        $shortcut.Description = "Start Ascend $name with startup status and recovery controls"
        $shortcut.IconLocation = (Join-Path $PSScriptRoot "assets/$($name.ToLowerInvariant()).ico") + ",0"
        $shortcut.Save()
    }
}

Write-Output 'Ascend profile ready.'
Write-Output "Profile path: $profilePath"
if (-not $SkipShortcuts) { Write-Output 'Ascend Vision and Ascend Hub shortcuts created.' }
