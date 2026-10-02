#requires -Version 5.1
[CmdletBinding()]
param([string]$PythonExe = (Get-Command python -ErrorAction Stop).Source)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 5) {
    throw 'This check requires Windows PowerShell 5.1; invoke it with powershell.exe, not pwsh.exe.'
}
$desktopDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath
$fixturePath = Join-Path $PSScriptRoot 'fixture_server.py'
$runtimeDirectory = Join-Path $env:TEMP ('ascend-supervisor-test-' + [guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($runtimeDirectory)

Add-Type -AssemblyName System.Web.Extensions
$references = @([object].Assembly.Location, [System.Net.IPAddress].Assembly.Location,
    [System.Linq.Enumerable].Assembly.Location,
    [System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location)
Add-Type -Path @((Join-Path $desktopDirectory 'ProcessHost.cs'),
    (Join-Path $desktopDirectory 'Supervisor.cs')) -ReferencedAssemblies $references

function Assert([bool]$condition, [string]$message) {
    if (-not $condition) { throw "FAILED: $message" }
}

function Get-FreePort {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return $listener.LocalEndpoint.Port } finally { $listener.Stop() }
}

function Wait-State($supervisor, [string]$name, [string[]]$states, [int]$seconds = 12) {
    $watch = [Diagnostics.Stopwatch]::StartNew()
    while ($watch.Elapsed.TotalSeconds -lt $seconds) {
        $current = $supervisor.Get($name)
        if ($current.State -in $states) { return $current }
        Start-Sleep -Milliseconds 100
    }
    throw "Timed out waiting for $name to become $($states -join ', ')"
}

$hubPort = Get-FreePort
$visionPort = Get-FreePort
$fixtureRoot = Split-Path -Parent $fixturePath
$profilePath = Join-Path $runtimeDirectory 'profile.json'
$logs = Join-Path $runtimeDirectory 'logs'
$profile = [ordered]@{
    schemaVersion = 1
    hub = [ordered]@{
        root = $fixtureRoot; executable = $PythonExe; buildId = 'test-hub'
        port = $hubPort; startupSeconds = 3
        fixtureArguments = @($fixturePath, '--component', 'hub', '--port', [string]$hubPort,
            '--mode', 'hang')
    }
    vision = [ordered]@{
        root = $fixtureRoot; executable = $PythonExe; buildId = 'test-vision'
        port = $visionPort; startupSeconds = 8
        fixtureArguments = @($fixturePath, '--component', 'vision', '--port', [string]$visionPort,
            '--mode', 'ready')
    }
}
function Save-Profile {
    [System.IO.File]::WriteAllText($profilePath, ($profile | ConvertTo-Json -Depth 8))
}

$supervisor = $null
try {
    Save-Profile
    $supervisor = New-Object Ascend.Desktop.Supervisor($profilePath, $logs, $true)
    Assert ($supervisor.Start('hub', $false)) 'hub fixture should start'
    Assert ($supervisor.Start('vision', $false)) 'vision fixture should start independently'
    $clock = [Diagnostics.Stopwatch]::StartNew()
    [void]$supervisor.Get('hub')
    Assert ($clock.ElapsedMilliseconds -lt 1000) 'snapshot must not block behind a frozen child'
    $vision = Wait-State $supervisor 'vision' @('ready', 'degraded')
    Assert ($vision.Url -match ('127\.0\.0\.1:' + $visionPort)) 'Vision URL must come from verified child marker'
    $hub = Wait-State $supervisor 'hub' @('failed') 7
    Assert ($hub.FailureCode -eq 'startup-timeout') 'frozen Hub must fail at its deadline'
    Assert ($supervisor.Get('vision').State -in @('ready', 'degraded')) 'Hub timeout must not stop Vision'

    $supervisor.ForceStop('vision')
    Assert ($supervisor.Get('vision').State -eq 'stopped') 'owned Vision tree must stop'
    Assert ($supervisor.Get('hub').State -eq 'failed') 'Vision stop must not alter Hub result'

    $profile.hub.fixtureArguments[-1] = 'exit'
    Save-Profile
    Assert ($supervisor.Start('hub', $false)) 'Hub should allow retry after failure'
    $hub = Wait-State $supervisor 'hub' @('failed')
    Assert ($hub.FailureCode -eq 'child-exit-4') 'early child exit must be distinct from timeout'

    $profile.vision.fixtureArguments[-1] = 'wrong-id'
    Save-Profile
    Assert ($supervisor.Start('vision', $false)) 'Vision should allow restart after stop'
    $vision = Wait-State $supervisor 'vision' @('failed')
    Assert ($vision.FailureCode -eq 'health-identity-mismatch') 'wrong instance identity must not be accepted'

    $profile.hub.fixtureArguments[-1] = 'ready'
    $profile.vision.fixtureArguments[-1] = 'ready'
    Save-Profile
    for ($cycle = 1; $cycle -le 10; $cycle++) {
        Assert ($supervisor.Start('hub', $false)) "Hub cycle $cycle should start"
        Assert ($supervisor.Start('vision', $false)) "Vision cycle $cycle should start"
        [void](Wait-State $supervisor 'hub' @('ready', 'degraded'))
        [void](Wait-State $supervisor 'vision' @('ready', 'degraded'))
        $supervisor.ForceStop('hub')
        $supervisor.ForceStop('vision')
        Assert ($supervisor.Get('hub').State -eq 'stopped') "Hub cycle $cycle should stop"
        Assert ($supervisor.Get('vision').State -eq 'stopped') "Vision cycle $cycle should stop"
    }

    $allLogs = (Get-ChildItem -LiteralPath $logs -File | ForEach-Object {
        [System.IO.File]::ReadAllText($_.FullName)
    }) -join "`n"
    Assert (-not $allLogs.Contains('private fixture message')) 'raw child stdout must not be persisted'

    $missingProfile = New-Object Ascend.Desktop.Supervisor((Join-Path $runtimeDirectory 'absent.json'),
        $logs, $true)
    try {
        Assert ($missingProfile.Start('hub', $false)) 'missing profile case should enter startup'
        $missing = Wait-State $missingProfile 'hub' @('failed')
        Assert ($missing.FailureCode -eq 'profile-missing') 'missing profile must report a repairable code'
    } finally {
        $missingProfile.Dispose()
    }

    $unreadableProfile = New-Object Ascend.Desktop.Supervisor($runtimeDirectory,
        $logs, $true)
    try {
        Assert ($unreadableProfile.Start('hub', $false)) 'unreadable profile case should enter startup'
        $unreadable = Wait-State $unreadableProfile 'hub' @('failed')
        Assert ($unreadable.FailureCode -eq 'profile-inaccessible') `
            'an existing but unreadable profile must not be reported as missing'
    } finally {
        $unreadableProfile.Dispose()
    }
    Write-Output 'supervisor fixture checks passed'
} finally {
    if ($null -ne $supervisor) { $supervisor.Dispose() }
    # Temporary test files contain only fixture configuration and safe codes.
    # They remain in the system temp directory for inspection after failure.
}
