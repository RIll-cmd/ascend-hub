# Shared WPF loading and presentation. Rendering never starts a runtime.
function Read-LauncherXaml([string]$path) {
    $reader = [Xml.XmlReader]::Create($path)
    try { return [Windows.Markup.XamlReader]::Load($reader) } finally { $reader.Dispose() }
}
function New-LauncherWindow([string]$directory, [string]$product) {
    $window = Read-LauncherXaml (Join-Path $directory "${product}Launcher.xaml")
    $resources = Read-LauncherXaml (Join-Path $directory 'LauncherResources.xaml')
    $window.Resources.MergedDictionaries.Add($resources)
    $iconPath = Join-Path $directory "assets/$($product.ToLowerInvariant()).ico"
    if (Test-Path -LiteralPath $iconPath) { $window.Icon = [Windows.Media.Imaging.BitmapFrame]::Create([Uri]::new($iconPath)) }
    return $window
}
function Get-CapabilityLabel([string]$value) {
    switch ($value) {
        'ready' { 'Available'; break }
        'starting' { 'Starting'; break }
        'reauth-required' { 'Sign-in required'; break }
        'disabled' { 'Disabled'; break }
        'unavailable' { 'Unavailable'; break }
        'request-failed' { 'Request failed'; break }
        'not-configured' { 'Not configured'; break }
        'offline' { 'Offline'; break }
        'unreachable' { 'Unreachable'; break }
        default { 'Not checked' }
    }
}
# Plain sentence for each startup failure; the code itself stays under Details.
function Get-HubFailureText([string]$code) {
    switch -Wildcard ($code) {
        'profile-missing' { "Hub isn't set up yet."; break }
        'port-in-use' { 'Another copy of Hub is using port 5173.'; break }
        'runtime-missing' { "Node.js wasn't found."; break }
        'hub-build-missing' { "Hub's files are missing."; break }
        'startup-timeout' { 'Hub took too long to start.'; break }
        'child-exit-*' { 'Hub stopped unexpectedly.'; break }
        default { "Hub couldn't start." }
    }
}
# $room is the parsed /api/room reply, or $null when Hub or the room is unreachable.
function Get-AgentSummary($room) {
    if ($null -eq $room -or -not $room.online -or $null -eq $room.agents) { return 'Offline' }
    $states = @($room.agents.PSObject.Properties | ForEach-Object { [string]$_.Value.state })
    if ($states.Count -eq 0) { return 'Offline' }
    if (@($states | Where-Object { $_ -ne 'checking' }).Count -eq 0) { return 'Starting' }
    $up = @($states | Where-Object { $_ -notin @('offline','checking') }).Count
    "$up of $($states.Count) agents"
}
# First candidate that is a rooted, existing msedge.exe; App Paths values may arrive quoted.
function Resolve-EdgePath([string[]]$candidates) {
    foreach ($candidate in $candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        $path = $candidate.Trim().Trim('"')
        if ([IO.Path]::IsPathRooted($path) -and [IO.Path]::GetFileName($path) -ieq 'msedge.exe' -and (Test-Path -LiteralPath $path -PathType Leaf)) { return $path }
    }
    $null
}
# The supervisor's step names are written for diagnostics; the Hub window shows them in plain words.
function Get-HubStepText([string]$stage) {
    switch -Wildcard ($stage) {
        'Checking runtime and imports*' { 'Checking Node.js'; break }
        'Waiting for authenticated health' { 'Waiting for Hub to answer'; break }
        'Optimizing Hub dependencies' { 'Preparing Hub (the first start can take a minute)'; break }
        'Starting Hub local server' { 'Starting Hub'; break }
        'Stopping previous Hub session' { 'Stopping the other copy'; break }
        default { $stage }
    }
}
# Hub's compact window: plain headings, one primary action, status lines only while Hub is open.
$script:HubAgentSummary = 'Offline'
function Set-HubDot($window, [string]$name, [string]$tone) {
    $window.FindName($name).Fill = $window.Resources[$(switch ($tone) { 'good' { 'Good' } 'warn' { 'Warn' } default { 'Edge' } })]
}
function Set-HubSnapshot($window, $snapshot, [string]$agents) {
    $state = $snapshot.State
    $starting = $state -in @('checking','starting')
    $running = $state -in @('ready','degraded')
    $open = $running -and -not [string]::IsNullOrWhiteSpace($snapshot.Url)
    $window.FindName('State').Text = switch ($state) {
        'stopped' { 'Hub is stopped' } 'checking' { 'Waking up Hub' } 'starting' { 'Waking up Hub' }
        'ready' { 'Hub is open' } 'degraded' { 'Hub is open, with limits' } 'failed' { Get-HubFailureText $snapshot.FailureCode }
        'stopping' { 'Stopping Hub' } 'stop_failed' { "Hub didn't stop" } default { 'Hub is stopped' }
    }
    $window.FindName('Kicker').Text = if ($starting) { 'STARTING' } elseif ($running) { 'RUNNING' } elseif ($state -in @('failed','stop_failed')) { 'NEEDS ATTENTION' } else { 'ASCEND HUB' }
    $window.FindName('Stage').Text = if ($starting) { Get-HubStepText $snapshot.Stage } elseif ($state -eq 'failed' -and $snapshot.FailureCode -eq 'port-in-use') { 'Stop the other copy, then Hub starts here.' } elseif ($state -eq 'failed') { 'Press Retry. If it keeps failing, open Details.' } else { '' }
    $window.FindName('Progress').Visibility = if ($starting) { 'Visible' } else { 'Collapsed' }
    $window.FindName('StatusLines').Visibility = if ($running) { 'Visible' } else { 'Collapsed' }
    $ui = if ($snapshot.Ui -eq 'ready') { 'Running' } else { Get-CapabilityLabel $snapshot.Ui }
    $core = Get-CapabilityLabel $snapshot.Core
    $window.FindName('UiStatus').Text = $ui
    $window.FindName('AgentStatus').Text = $agents
    $window.FindName('CoreStatus').Text = $core
    Set-HubDot $window 'UiDot' $(if ($ui -eq 'Running') { 'good' } else { 'warn' })
    Set-HubDot $window 'AgentDot' $(if ($agents -match '^[1-9]\d* of ') { 'good' } elseif ($agents -eq 'Starting') { 'warn' } else { 'off' })
    Set-HubDot $window 'CoreDot' $(if ($core -eq 'Available') { 'good' } elseif ($core -eq 'Not checked') { 'off' } else { 'warn' })
    $primary = $window.FindName('Primary')
    $primary.Content = if ($open) { '_Open Hub' } elseif ($starting) { 'Starting...' } elseif ($state -eq 'failed') { '_Retry' } elseif ($state -in @('stopping','stop_failed')) { 'Stopping...' } else { '_Start Hub' }
    $primary.IsEnabled = $open -or $state -in @('stopped','failed')
    [Windows.Automation.AutomationProperties]::SetName($primary, ($primary.Content -replace '_',''))
    foreach ($spec in @(@('Cancel',$starting), @('Stop',$running), @('Force',($state -in @('stopping','stop_failed'))))) {
        $button = $window.FindName($spec[0]); $button.Visibility = if ($spec[1]) { 'Visible' } else { 'Collapsed' }; $button.IsEnabled = [bool]$spec[1]
    }
    $replacement = $window.FindName('ReplaceSession')
    $show = $state -eq 'failed' -and $snapshot.FailureCode -eq 'port-in-use'
    $replacement.Visibility = if ($show) { 'Visible' } else { 'Collapsed' }
    $replacement.IsEnabled = $show -and [bool]$snapshot.CanReplaceSession
    $replacement.ToolTip = if ($snapshot.CanReplaceSession) { "Stop the other Hub (PID $($snapshot.ConflictPid)) and start here" } else { "That copy couldn't be verified as yours. Close it yourself, then press Retry." }
    $seconds = [math]::Floor($snapshot.ElapsedSeconds)
    $window.FindName('Timing').Text = if ($running) { "Started in $([math]::Floor($snapshot.StartupSeconds))s, running for ${seconds}s" } elseif ($starting) { "Starting for ${seconds}s" } else { '' }
    $window.FindName('Failure').Text = if ($snapshot.FailureCode) { "Code: $($snapshot.FailureCode). Step: $($snapshot.FailureStage). $($snapshot.Stage)" } else { 'Startup details appear here if something goes wrong.' }
}
function Set-LauncherSnapshot($window, $snapshot, [string]$product) {
    if ($product -eq 'Hub') { Set-HubSnapshot $window $snapshot $script:HubAgentSummary; return }
    $state = $snapshot.State
    $canStart = $state -in @('stopped', 'failed')
    $starting = $state -in @('checking', 'starting')
    $canOpen = $state -in @('ready', 'degraded') -and -not [string]::IsNullOrWhiteSpace($snapshot.Url)
    $primary = $window.FindName('Primary')
    $primary.Content = if ($canOpen) { "_Open $product" } elseif ($starting) { 'Starting...' } elseif ($state -eq 'stopping') { 'Stopping...' } elseif ($state -eq 'stop_failed') { 'Could not stop' } elseif ($state -eq 'failed') { "_Retry $product" } else { "_Start $product" }
    $primary.IsEnabled = $canStart -or $canOpen
    [Windows.Automation.AutomationProperties]::SetName($primary, ($primary.Content -replace '_',''))
    $title = switch ($state) {
        'stopped' { 'Ready when you are' }
        'checking' { 'Checking installation' }
        'starting' { "Starting $product" }
        'ready' { if ($product -eq 'Vision') { if ($snapshot.Recovery) { 'Chat only is ready' } else { 'Ready to talk' } } else { 'Interface ready' } }
        'degraded' { if ($canOpen) { if ($snapshot.Recovery) { 'Chat only is ready' } else { 'Available with limitations' } } else { 'Health not available' } }
        'failed' { if ($snapshot.FailureCode -eq 'profile-missing') { 'Setup required' } else { if($snapshot.ReachedReady){"$product stopped unexpectedly"}else{"Could not start $product"} } }
        'stopping' { "Stopping $product" }
        'stop_failed' { "Could not stop $product" }
        default { 'Not checked' }
    }
    $window.FindName('State').Text = $title
    $window.FindName('Stage').Text = $snapshot.Stage
    $seconds = [math]::Floor($snapshot.ElapsedSeconds)
    $stageSeconds = [math]::Floor($snapshot.StageElapsedSeconds)
    $window.FindName('Timing').Text = if ($starting) { "Stage ${stageSeconds}s / startup ${seconds}s" } elseif ($state -in @('ready','degraded')) { "Started in $([math]::Floor($snapshot.StartupSeconds))s / uptime ${seconds}s" } elseif ($state -in @('stopping','stop_failed')) { "Shutdown ${seconds}s" } elseif ($state -eq 'failed') { if($snapshot.ReachedReady){"Runtime ended after ${seconds}s; startup $([math]::Floor($snapshot.StartupSeconds))s"}else{"Startup ended after ${seconds}s"} } elseif ($snapshot.RetryCount -gt 0) { "Stopped after ${seconds}s" } else { '' }
    foreach ($spec in @(@('Cancel', $starting), @('Stop', ($state -in @('ready','degraded'))), @('Force', ($state -in @('stopping','stop_failed'))))) {
        $button=$window.FindName($spec[0]);$button.Visibility=if($spec[1]){'Visible'}else{'Collapsed'};$button.IsEnabled=[bool]$spec[1]
    }
    $replacement=$window.FindName('ReplaceSession')
    if($null -ne $replacement) {
        $showReplacement=$state -eq 'failed' -and $snapshot.FailureCode -eq 'port-in-use'
        $replacement.Visibility=if($showReplacement){'Visible'}else{'Collapsed'}
        $replacement.IsEnabled=$showReplacement -and [bool]$snapshot.CanReplaceSession
        $replacement.ToolTip=if($snapshot.CanReplaceSession){"Stop verified Hub session (PID $($snapshot.ConflictPid)) and start again"}else{'The app using this port could not be verified as your Hub session. Close it manually.'}
    }
    $recovery=$window.FindName('ChatRecovery')
    if ($null -ne $recovery) { $recovery.IsEnabled=$canStart }
    foreach ($spec in @(@('UiStatus','Ui'),@('ChatStatus','Chat'),@('CameraStatus','Camera'),@('MicrophoneStatus','Microphone'),@('CoreStatus','Core'))) {
        $control=$window.FindName($spec[0]);if($null -ne $control){$control.Text=Get-CapabilityLabel $snapshot.($spec[1])}
    }
    $window.FindName('Failure').Text = if ($snapshot.FailureCode) { "Stage: $($snapshot.FailureStage). Code: $($snapshot.FailureCode). $($snapshot.Stage)" } else { 'Local startup and exit metadata only. Camera, models and providers are not accessed by this window.' }
}
