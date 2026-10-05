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
function Set-LauncherSnapshot($window, $snapshot, [string]$product) {
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
    $recovery=$window.FindName('ChatRecovery')
    if ($null -ne $recovery) { $recovery.IsEnabled=$canStart }
    foreach ($spec in @(@('UiStatus','Ui'),@('ChatStatus','Chat'),@('CameraStatus','Camera'),@('MicrophoneStatus','Microphone'),@('CoreStatus','Core'))) {
        $control=$window.FindName($spec[0]);if($null -ne $control){$control.Text=Get-CapabilityLabel $snapshot.($spec[1])}
    }
    $window.FindName('Failure').Text = if ($snapshot.FailureCode) { "Stage: $($snapshot.FailureStage). Code: $($snapshot.FailureCode). $($snapshot.Stage)" } else { 'Local startup and exit metadata only. Camera, models and providers are not accessed by this window.' }
}
