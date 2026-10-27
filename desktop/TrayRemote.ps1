# The tray remote: a small shelf of three TVs, a lower third and a remote strip, drawn from the room's GET /tray reply.
# Pure helpers first (Test-TrayLogic.ps1 covers them), then the window. Requires LauncherPresentation.ps1.
$script:TrayIds = @('codex','claude','agy')
$script:TrayNames = @{ codex = 'Codex'; claude = 'Claude'; agy = 'Antigravity' }
$script:TrayColors = @{ codex = '#E28A2B'; claude = '#D97757'; agy = '#3D7BFF' }

# The TV that needs you or works leads; else the last one picked; else Claude.
function Get-TraySelection($tray, [string]$lastPicked) {
    if ($tray -and $tray.lead) { return [string]$tray.lead }
    if ($lastPicked) { $lastPicked } else { 'claude' }
}

function Get-PowerState([string]$hubState, [string]$idleAction) {
    if ($hubState -in @('checking','starting')) { return 'starting' }
    if ($hubState -in @('ready','degraded')) { if ($idleAction -like 'countdown:*') { return 'closing:' + $idleAction.Split(':')[1] } else { return 'on' } }
    'off'
}

# Just above (or beside) the tray icon: anchored to the work area's edge nearest the cursor, 8 px in, never outside it.
function Get-PopupPlacement([Windows.Rect]$workArea, [double]$width, [double]$height, [Windows.Point]$cursor) {
    $gap = 8
    $outside = @{ bottom = $cursor.Y - $workArea.Bottom; top = $workArea.Top - $cursor.Y; right = $cursor.X - $workArea.Right; left = $workArea.Left - $cursor.X }
    $edge = ($outside.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Name
    $clamp = { param($v, $lo, $hi) [math]::Max($lo, [math]::Min($v, $hi)) }
    $left = & $clamp ($cursor.X - $width / 2) ($workArea.Left + $gap) ($workArea.Right - $width - $gap)
    $top = & $clamp ($cursor.Y - $height / 2) ($workArea.Top + $gap) ($workArea.Bottom - $height - $gap)
    switch ($edge) {
        'bottom' { $top = $workArea.Bottom - $height - $gap }
        'top' { $top = $workArea.Top + $gap }
        'right' { $left = $workArea.Right - $width - $gap }
        'left' { $left = $workArea.Left + $gap }
    }
    @{ Left = [math]::Round($left); Top = [math]::Round($top) }
}

# What the lower third shows for the selected agent at a position in today's sessions (0 is the newest). The newest,
# while it runs, speaks in the TV's own live words; with no sessions today it is the live status and no arrows.
function Get-LowerThird($tray, [string]$selected, [int]$index) {
    if ($null -eq $tray) { return @{ Channel = ''; Bug = 'OFF'; Headline = 'ROOM CLOSED'; Sub = 'start the room from the launcher'; Banner = '#5F5E5A'; Count = 0; Index = 0; SessionId = $null; Running = $false } }
    $tv = @($tray.tvs | Where-Object { $_.id -eq $selected })[0]
    $today = @($tray.today.$selected | Where-Object { $_ })
    $count = $today.Count
    $i = if ($count) { [math]::Max(0, [math]::Min($index, $count - 1)) } else { 0 }
    $live = @{ Channel = $tv.channel; Bug = $tv.bug; Headline = $tv.headline; Sub = $tv.sub; Banner = $tv.banner; Count = $count; Index = $i; SessionId = $null; Running = $false }
    if ($count -eq 0) { return $live }
    $entry = $today[$i]
    if ($i -eq 0 -and $tray.running -and $entry.headline -like 'RUNNING*') { $live.SessionId = $entry.id; $live.Running = $true; return $live }
    @{ Channel = $tv.channel; Bug = 'IDLE'; Headline = $entry.headline; Sub = $entry.sub; Banner = '#5F5E5A'; Count = $count; Index = $i; SessionId = $entry.id; Running = $false }
}

# Keys: 1/2/3 pick an agent (from its newest session), Left/Right step, Esc closes.
function Get-TrayKey([string]$key, [string]$selected, [int]$index) {
    $pick = @{ D1 = 'codex'; NumPad1 = 'codex'; D2 = 'claude'; NumPad2 = 'claude'; D3 = 'agy'; NumPad3 = 'agy' }
    if ($pick.ContainsKey($key)) { return @{ Selected = $pick[$key]; Index = 0; Close = $false } }
    switch ($key) {
        'Left' { return @{ Selected = $selected; Index = [math]::Max(0, $index - 1); Close = $false } }
        'Right' { return @{ Selected = $selected; Index = $index + 1; Close = $false } }
        'Escape' { return @{ Selected = $selected; Index = $index; Close = $true } }
    }
    @{ Selected = $selected; Index = $index; Close = $false }
}

function New-TrayRemote([string]$desktopDirectory) {
    $window = Read-LauncherXaml (Join-Path $desktopDirectory 'TrayRemote.xaml')
    $window.Tag = @{ Brush = @{} }
    $window
}

function Get-TrayBrush($window, [string]$hex) {
    $cache = $window.Tag.Brush
    if (-not $cache.ContainsKey($hex)) { $brush = [Windows.Media.SolidColorBrush][Windows.Media.ColorConverter]::ConvertFromString($hex); $brush.Freeze(); $cache[$hex] = $brush }
    $cache[$hex]
}

# The agent's colour at 22% over a dark screen: an idle TV still says whose it is.
function Get-DimColor([string]$hex) {
    $c = [Windows.Media.ColorConverter]::ConvertFromString($hex); $base = @(0x1A, 0x19, 0x18)
    '#{0:X2}{1:X2}{2:X2}' -f [int]($c.R * 0.22 + $base[0] * 0.78), [int]($c.G * 0.22 + $base[1] * 0.78), [int]($c.B * 0.22 + $base[2] * 0.78)
}

# $blinkOn: the needs-you screen and the LIVE / WAIT light dim on alternate half-seconds while the window shows.
function Set-TrayRemote($window, $tray, [string]$selected, [int]$index, [string]$power, [bool]$blinkOn = $true) {
    $find = { param($name) $window.FindName($name) }
    for ($n = 0; $n -lt 3; $n++) {
        $id = $script:TrayIds[$n]
        $tv = if ($tray) { @($tray.tvs | Where-Object { $_.id -eq $id })[0] } else { $null }
        $mood = if ($tv) { [string]$tv.mood } else { 'offline' }
        $screen = & $find "Screen$n"; $eyes = @((& $find "EyeL$n"), (& $find "EyeR$n"))
        $screen.Opacity = 1
        switch ($mood) {
            { $_ -in @('working','reviewing') } { $screen.Background = Get-TrayBrush $window $script:TrayColors[$id]; foreach ($e in $eyes) { $e.Visibility = 'Visible'; $e.Height = 6; $e.Fill = Get-TrayBrush $window '#1A1410' } }
            'stuck' { $screen.Background = Get-TrayBrush $window '#EF9F27'; $screen.Opacity = if ($blinkOn) { 1 } else { 0.55 }; foreach ($e in $eyes) { $e.Visibility = 'Visible'; $e.Height = 6; $e.Fill = Get-TrayBrush $window '#3C3489' } }
            'offline' { $screen.Background = $window.Resources['Static']; foreach ($e in $eyes) { $e.Visibility = 'Collapsed' } }
            default { $screen.Background = Get-TrayBrush $window (Get-DimColor $script:TrayColors[$id]); foreach ($e in $eyes) { $e.Visibility = 'Visible'; $e.Height = 2; $e.Fill = Get-TrayBrush $window '#888780' } }
        }
        (& $find "TvBody$n").BorderBrush = Get-TrayBrush $window $(if ($id -eq $selected) { '#F3D6A6' } else { '#002C2A26' })
        $label = if ($tv) { "$($script:TrayNames[$id]): $($tv.headline), $($tv.sub)" } else { "$($script:TrayNames[$id]): no signal" }
        [Windows.Automation.AutomationProperties]::SetName((& $find "Tv$n"), $label)
    }
    $lower = Get-LowerThird $tray $selected $index
    (& $find 'Channel').Text = $lower.Channel
    (& $find 'Bug').Text = $lower.Bug
    $dot = @{ LIVE = '#E24B4A'; WAIT = '#EF9F27'; IDLE = '#888780'; OFF = '#5F5E5A' }[$lower.Bug]
    (& $find 'BugDot').Fill = Get-TrayBrush $window $(if ($dot) { $dot } else { '#888780' })
    (& $find 'BugDot').Opacity = if ($lower.Bug -in @('LIVE','WAIT') -and -not $blinkOn) { 0.35 } else { 1 }
    (& $find 'Headline').Text = $lower.Headline
    (& $find 'Sub').Text = $lower.Sub
    (& $find 'Banner').Background = Get-TrayBrush $window $lower.Banner
    $open = if ($null -eq $tray) { 'Show the launcher' } elseif ($lower.SessionId) { 'Open this session in Hub' } else { 'Open the agent room in Hub' }
    [Windows.Automation.AutomationProperties]::SetName((& $find 'Lower'), "$($lower.Headline), $($lower.Sub). $open")
    $arrows = if ($lower.Count -gt 1) { 'Visible' } else { 'Hidden' }
    (& $find 'Prev').Visibility = $arrows; (& $find 'Next').Visibility = $arrows
    (& $find 'Prev').IsEnabled = $lower.Index -gt 0; (& $find 'Next').IsEnabled = $lower.Index -lt $lower.Count - 1
    (& $find 'Position').Text = if ($lower.Count) { "$($lower.Index + 1)/$($lower.Count)" } else { '' }
    $powerButton = & $find 'Power'; $powerText = & $find 'PowerText'
    switch -Wildcard ($power) {
        'off' { $powerButton.Background = Get-TrayBrush $window '#5F5E5A'; $powerText.Text = [char]0x23FB + ' HUB'; $name = 'Turn Hub on' }
        'starting' { $powerButton.Background = Get-TrayBrush $window '#BA7517'; $powerText.Text = '... HUB'; $name = 'Hub is starting' }
        'closing:*' { $m = $power.Split(':')[1]; $powerButton.Background = Get-TrayBrush $window '#444441'; $powerText.Text = [char]0x23FB + " ${m}m"; $name = "Turn Hub off (it closes by itself in $m minutes)" }
        default { $powerButton.Background = Get-TrayBrush $window '#0F6E56'; $powerText.Text = [char]0x23FB + ' HUB'; $name = 'Turn Hub off' }
    }
    [Windows.Automation.AutomationProperties]::SetName($powerButton, $name)
    $lower
}
