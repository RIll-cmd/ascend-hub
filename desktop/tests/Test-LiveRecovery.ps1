#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ProfilePath)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 5) {
    throw 'This check requires Windows PowerShell 5.1; invoke it with powershell.exe, not pwsh.exe.'
}
$desktopDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath
$profile = Get-Content -LiteralPath $ProfilePath -Raw | ConvertFrom-Json
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
try { $profile.hub.port = $listener.LocalEndpoint.Port } finally { $listener.Stop() }
$scratch = Join-Path (Split-Path -Parent $ProfilePath) 'live-recovery-check'
[void][System.IO.Directory]::CreateDirectory($scratch)
$testProfilePath = Join-Path $scratch 'profile.json'
[System.IO.File]::WriteAllText($testProfilePath, ($profile | ConvertTo-Json -Depth 7))

Add-Type -AssemblyName System.Web.Extensions
$references = @([object].Assembly.Location, [System.Net.IPAddress].Assembly.Location,
    [System.Linq.Enumerable].Assembly.Location,
    [System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location)
Add-Type -Path @((Join-Path $desktopDirectory 'ProcessHost.cs'),
    (Join-Path $desktopDirectory 'Supervisor.cs')) -ReferencedAssemblies $references

$supervisor = New-Object Ascend.Desktop.Supervisor($testProfilePath,
    (Join-Path $scratch 'logs'), $false)
try {
    if (-not $supervisor.Start('hub', $false)) { throw 'Hub did not accept Start' }
    if (-not $supervisor.Start('vision', $true)) { throw 'Vision recovery did not accept Start' }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    while ($watch.Elapsed.TotalSeconds -lt 120) {
        $hub = $supervisor.Get('hub')
        $vision = $supervisor.Get('vision')
        if ($hub.State -eq 'failed' -or $vision.State -eq 'failed') {
            throw "Hub=$($hub.State)/$($hub.FailureCode); Vision=$($vision.State)/$($vision.FailureCode)"
        }
        if ($hub.State -in @('ready', 'degraded') -and $vision.State -in @('ready', 'degraded')) {
            if ($hub.Url -notmatch '^http://127\.0\.0\.1:' -or
                    $vision.Url -notmatch '^http://127\.0\.0\.1:') {
                throw 'Authenticated local URLs were not published'
            }
            Write-Output "Hub=$($hub.State) Vision=$($vision.State) elapsed=$([math]::Round($watch.Elapsed.TotalSeconds,1))s"
            Write-Output "Vision capabilities: $($vision.Capabilities)"
            $supervisor.Stop('vision')
            $stopWatch = [Diagnostics.Stopwatch]::StartNew()
            while ($stopWatch.Elapsed.TotalSeconds -lt 8 -and
                    $supervisor.Get('vision').State -ne 'stopped') {
                Start-Sleep -Milliseconds 100
            }
            if ($supervisor.Get('vision').State -ne 'stopped') {
                throw 'Vision recovery did not stop through its authenticated shutdown endpoint'
            }
            Write-Output 'Vision graceful stop passed'
            return
        }
        Start-Sleep -Milliseconds 300
    }
    throw "Health deadline; Hub=$($hub.State)/$($hub.Stage), Vision=$($vision.State)/$($vision.Stage)"
} finally {
    $supervisor.Dispose()
}
