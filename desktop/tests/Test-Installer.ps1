#requires -Version 5.1
[CmdletBinding()]
param([string]$ScratchParent)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 5) {
    throw 'This check requires Windows PowerShell 5.1; invoke it with powershell.exe, not pwsh.exe.'
}
if (-not $ScratchParent) {
    $ScratchParent = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).ProviderPath '.wrangler'
}
[void][System.IO.Directory]::CreateDirectory($ScratchParent)

function Assert([bool]$condition, [string]$message) {
    if (-not $condition) { throw "FAILED: $message" }
}

$scratch = Join-Path $ScratchParent ('desktop-installer-test-' + [guid]::NewGuid().ToString('N'))
$hubRoot = Join-Path $scratch 'hub'
$visionRoot = Join-Path $scratch 'vision'
$destination = Join-Path $scratch 'installed'
$shortcuts = Join-Path $scratch 'shortcuts'
foreach ($directory in @(
        (Join-Path $hubRoot 'node_modules\vinext\dist'),
        (Join-Path $visionRoot 'fairy-ui\dist'), $destination, $shortcuts)) {
    [void][System.IO.Directory]::CreateDirectory($directory)
}
foreach ($file in @(
        (Join-Path $hubRoot 'node_modules\vinext\dist\cli.js'),
        (Join-Path $visionRoot 'fairy-ui\dist\index.html'),
        (Join-Path $visionRoot 'desktop_host.py'),
        (Join-Path $visionRoot 'config.yaml'),
        (Join-Path $visionRoot '.env'))) {
    [System.IO.File]::WriteAllText($file, '')
}

$installer = Join-Path $PSScriptRoot '..\Install-Ascend.ps1'
& $installer -HubRoot $hubRoot -VisionRoot $visionRoot `
    -NodeExe (Join-Path $env:WINDIR 'System32\cmd.exe') `
    -PythonExe (Join-Path $env:WINDIR 'System32\cmd.exe') `
    -DestinationRoot $destination -ShortcutDirectory $shortcuts | Out-Null

$expectedProfile = Join-Path $destination 'profile.json'
Assert (Test-Path -LiteralPath $expectedProfile) 'installer must write the profile'
$shell = New-Object -ComObject WScript.Shell
foreach ($name in @('Vision', 'Hub')) {
    $shortcut = $shell.CreateShortcut((Join-Path $shortcuts "Ascend $name.lnk"))
    $expectedIcon=(Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath "assets/$($name.ToLowerInvariant()).ico")
    Assert ($shortcut.IconLocation -eq "$expectedIcon,0") "$name shortcut needs its product icon"
    Assert ($shortcut.WorkingDirectory -eq $hubRoot) "$name working directory must preserve checkout"
    Assert ($shortcut.Arguments.Contains("-Target $name")) "$name shortcut must select its own app"
    Assert ($shortcut.Arguments.Contains("-ProfilePath `"$expectedProfile`"")) `
        "$name shortcut must pass the installed profile path explicitly"
}
& $installer -HubRoot $hubRoot -VisionRoot $visionRoot `
    -NodeExe (Join-Path $env:WINDIR 'System32\cmd.exe') `
    -PythonExe (Join-Path $env:WINDIR 'System32\cmd.exe') `
    -DestinationRoot $destination -ShortcutDirectory $shortcuts -Force | Out-Null
$backups = @(Get-ChildItem -LiteralPath $destination -Filter 'profile-backup-*.json' -File)
Assert ($backups.Count -eq 1) 'forced reinstall must retain one profile backup'
'installer shortcut profile checks passed'
