#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('None', 'Vision', 'Hub')]
    [string]$Target = 'None',
    [string]$ProfilePath = (Join-Path $env:LOCALAPPDATA 'Ascend\Desktop\profile.json'),
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
$desktopDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$diagnosticsDirectory = Join-Path $env:LOCALAPPDATA 'Ascend\Desktop\logs'

try {
    Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Web.Extensions

    $ownerSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $mutexName = "Local\AscendDesktop-$ownerSid"
    $ownerMutex = New-Object System.Threading.Mutex($false, $mutexName)
    $ownsMutex = $ownerMutex.WaitOne(0)
    if (-not $ownsMutex) {
        if ($Target -ne 'None') {
            $eventName = "Local\AscendDesktop-$ownerSid-$($Target.ToLowerInvariant())"
            for ($attempt = 0; $attempt -lt 10; $attempt++) {
                try {
                    $existingEvent = [System.Threading.EventWaitHandle]::OpenExisting($eventName)
                    try { [void]$existingEvent.Set() } finally { $existingEvent.Dispose() }
                    break
                } catch [System.Threading.WaitHandleCannotBeOpenedException] {
                    Start-Sleep -Milliseconds 100
                }
            }
        }
        return
    }

    $visionEvent = New-Object System.Threading.EventWaitHandle($false, [System.Threading.EventResetMode]::AutoReset,
        "Local\AscendDesktop-$ownerSid-vision")
    $hubEvent = New-Object System.Threading.EventWaitHandle($false, [System.Threading.EventResetMode]::AutoReset,
        "Local\AscendDesktop-$ownerSid-hub")

    $references = @(
        [object].Assembly.Location,
        [System.Net.IPAddress].Assembly.Location,
        [System.Linq.Enumerable].Assembly.Location,
        [System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location
    )
    Add-Type -Path @(
        (Join-Path $desktopDirectory 'ProcessHost.cs'),
        (Join-Path $desktopDirectory 'Supervisor.cs')
    ) -ReferencedAssemblies $references

    $reader = [System.Xml.XmlReader]::Create((Join-Path $desktopDirectory 'Launcher.xaml'))
    try { $window = [Windows.Markup.XamlReader]::Load($reader) } finally { $reader.Dispose() }

    $ui = @{}
    foreach ($name in @('VisionState', 'VisionStage', 'VisionCapabilities', 'VisionStart',
            'VisionRecovery', 'VisionOpen', 'VisionStop', 'VisionForce', 'HubState',
            'HubStage', 'HubCapabilities', 'HubStart', 'HubOpen', 'HubStop', 'HubForce',
            'ProfileStatus', 'Diagnostics')) {
        $ui[$name] = $window.FindName($name)
        if ($null -eq $ui[$name]) { throw "Launcher control missing: $name" }
    }

    $supervisor = [Ascend.Desktop.Supervisor]::new($ProfilePath, $diagnosticsDirectory, $false)
    $openedInstance = @{ vision = ''; hub = '' }

    function Open-AscendUrl([string]$component) {
        $snapshot = $supervisor.Get($component)
        if ([string]::IsNullOrWhiteSpace($snapshot.Url)) { return }
        $parsed = [Uri]$snapshot.Url
        if ($parsed.Scheme -ne 'http' -or $parsed.Host -ne '127.0.0.1') { return }
        $start = New-Object System.Diagnostics.ProcessStartInfo($parsed.AbsoluteUri)
        $start.UseShellExecute = $true
        [void][System.Diagnostics.Process]::Start($start)
    }

    function Update-AscendCard([string]$component) {
        $snapshot = $supervisor.Get($component)
        $prefix = if ($component -eq 'vision') { 'Vision' } else { 'Hub' }
        $ui["${prefix}State"].Text = $snapshot.State.ToUpperInvariant()
        $elapsed = [math]::Floor($snapshot.ElapsedSeconds)
        $ui["${prefix}Stage"].Text = "$($snapshot.Stage) - ${elapsed}s"
        $ui["${prefix}Capabilities"].Text = $snapshot.Capabilities
        $canStart = $snapshot.State -in @('stopped', 'failed')
        $ui["${prefix}Start"].IsEnabled = $canStart
        $ui["${prefix}Open"].IsEnabled = -not [string]::IsNullOrWhiteSpace($snapshot.Url)
        $ui["${prefix}Stop"].IsEnabled = $snapshot.State -in @('ready', 'degraded')
        $ui["${prefix}Force"].IsEnabled = $snapshot.State -in @('checking', 'starting', 'ready', 'degraded', 'stopping')
        if ($component -eq 'vision') { $ui['VisionRecovery'].IsEnabled = $canStart }

        if ($snapshot.State -in @('ready', 'degraded') -and
                $snapshot.InstanceId -ne $openedInstance[$component] -and
                -not [string]::IsNullOrWhiteSpace($snapshot.Url)) {
            $openedInstance[$component] = $snapshot.InstanceId
            try { Open-AscendUrl $component } catch { $ui["${prefix}Stage"].Text = 'Ready; use Open to show the browser' }
        }
    }

    $ui['VisionStart'].Add_Click({ [void]$supervisor.Start('vision', $false) })
    $ui['VisionRecovery'].Add_Click({ [void]$supervisor.Start('vision', $true) })
    $ui['VisionOpen'].Add_Click({
        try { Open-AscendUrl 'vision' } catch { $ui['ProfileStatus'].Text = 'Could not open Fairy; check your default browser' }
    })
    $ui['VisionStop'].Add_Click({ $supervisor.Stop('vision') })
    $ui['VisionForce'].Add_Click({ $supervisor.ForceStop('vision') })
    $ui['HubStart'].Add_Click({ [void]$supervisor.Start('hub', $false) })
    $ui['HubOpen'].Add_Click({
        try { Open-AscendUrl 'hub' } catch { $ui['ProfileStatus'].Text = 'Could not open Hub; check your default browser' }
    })
    $ui['HubStop'].Add_Click({ $supervisor.Stop('hub') })
    $ui['HubForce'].Add_Click({ $supervisor.ForceStop('hub') })
    $ui['Diagnostics'].Add_Click({
        try {
            if (-not (Test-Path -LiteralPath $diagnosticsDirectory)) {
                New-Item -ItemType Directory -Path $diagnosticsDirectory -Force | Out-Null
            }
            [void][System.Diagnostics.Process]::Start($diagnosticsDirectory)
        } catch {
            $ui['ProfileStatus'].Text = 'Could not open diagnostics folder'
        }
    })

    $ui['ProfileStatus'].Text = if (Test-Path -LiteralPath $ProfilePath) {
        'Each app starts separately; Core connection is checked inside the app'
    } else {
        'Setup required: run Install-Ascend.ps1 to create the local profile'
    }

    $timer = New-Object Windows.Threading.DispatcherTimer
    $timer.Interval = [TimeSpan]::FromMilliseconds(250)
    $timer.Add_Tick({
        try {
            if ($visionEvent.WaitOne(0)) { [void]$supervisor.Start('vision', $false); $window.Activate() | Out-Null }
            if ($hubEvent.WaitOne(0)) { [void]$supervisor.Start('hub', $false); $window.Activate() | Out-Null }
            Update-AscendCard 'vision'
            Update-AscendCard 'hub'
        } catch {
            $ui['ProfileStatus'].Text = 'Status update failed; reopen the launcher for diagnostics'
        }
    })
    $window.Add_Closing({
        $vision = $supervisor.Get('vision')
        $hub = $supervisor.Get('hub')
        if ($vision.Owned -or $hub.Owned) {
            $answer = [System.Windows.MessageBox]::Show(
                'Closing the launcher will stop the Ascend apps it started. Close now?',
                'Ascend Desktop', [System.Windows.MessageBoxButton]::YesNo,
                [System.Windows.MessageBoxImage]::Question)
            if ($answer -ne [System.Windows.MessageBoxResult]::Yes) { $_.Cancel = $true }
        }
    })
    $window.Add_Closed({ $timer.Stop(); $supervisor.Dispose() })
    Update-AscendCard 'vision'
    Update-AscendCard 'hub'
    if ($SelfTest) {
        $supervisor.Dispose()
        'launcher-components-loaded'
        return
    }
    $timer.Start()
    if ($Target -ne 'None') { [void]$supervisor.Start($Target.ToLowerInvariant(), $false) }
    [void]$window.ShowDialog()
} catch {
    # A broken launcher must leave an actionable message, even when its GUI
    # could not initialize. Do not display exception text; it may hold a path.
    Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
    [void][System.Windows.MessageBox]::Show(
        'Ascend Desktop could not open. Check the launcher files and the local profile, then run the shortcut again.',
        'Ascend Desktop startup error', [System.Windows.MessageBoxButton]::OK,
        [System.Windows.MessageBoxImage]::Error)
    exit 1
} finally {
    if ($null -ne $hubEvent) { $hubEvent.Dispose() }
    if ($null -ne $visionEvent) { $visionEvent.Dispose() }
    if ($ownsMutex) { $ownerMutex.ReleaseMutex() }
    if ($null -ne $ownerMutex) { $ownerMutex.Dispose() }
}
