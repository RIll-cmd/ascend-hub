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
        { $_ -in @('Left','PageUp') } { return @{ Selected = $selected; Index = [math]::Max(0, $index - 1); Close = $false } }
        { $_ -in @('Right','PageDown') } { return @{ Selected = $selected; Index = $index + 1; Close = $false } }
        'Escape' { return @{ Selected = $selected; Index = $index; Close = $true } }
    }
    @{ Selected = $selected; Index = $index; Close = $false }
}

# "task 2/3 - Login form" on a coding TV: the bar under the lower third. Anything else has no bar.
function Get-TaskProgress([string]$sub) {
    if ($sub -notmatch '^task (\d+)/(\d+)') { return $null }
    $current = [int]$Matches[1]; $total = [int]$Matches[2]
    if ($current -lt 1 -or $current -gt $total) { return $null }
    @{ Current = $current; Total = $total }
}

# The mascot face each mood draws on its screen: eyes, mouth and a mark beside them.
function Get-TvFace([string]$mood) {
    switch ($mood) {
        'working' { return @{ Eyes = 'open'; Mouth = 'smile'; Mark = '' } }
        'reviewing' { return @{ Eyes = 'squint'; Mouth = 'flat'; Mark = '' } }
        'stuck' { return @{ Eyes = 'wide'; Mouth = 'o'; Mark = '!' } }
        'offline' { return @{ Eyes = 'none'; Mouth = 'none'; Mark = '' } }
    }
    @{ Eyes = 'closed'; Mouth = 'flat'; Mark = 'z' }
}

# The header light: amber while a TV waits for you, red while one works, dark otherwise.
function Get-OnAir($tray) {
    $bugs = if ($tray) { @($tray.tvs | ForEach-Object { $_.bug }) } else { @() }
    if ($bugs -contains 'WAIT') { 'wait' } elseif ($bugs -contains 'LIVE') { 'live' } else { 'off' }
}

# Working sets of Hub and the room with everything they started; a negative room size is a room started elsewhere,
# which the launcher does not measure.
function Get-MemoryLine([long]$hubBytes, [long]$roomBytes) {
    $part = { param($name, $bytes) if ($bytes -gt 0) { "$name $([math]::Round($bytes / 1MB)) MB" } else { "$name OFF" } }
    if ($roomBytes -lt 0) { return & $part 'HUB' $hubBytes }
    "$(& $part 'HUB' $hubBytes) $([char]0xB7) $(& $part 'ROOM' $roomBytes)"
}

function Get-TodayLine([int]$count) {
    if ($count -eq 0) { 'no sessions today' } elseif ($count -eq 1) { '1 session today' } else { "$count sessions today" }
}

function New-TrayRemote([string]$desktopDirectory) {
    $window = Read-LauncherXaml (Join-Path $desktopDirectory 'TrayRemote.xaml')
    $window.Tag = @{ Brush = @{}; Glow = @{}; Mouth = @{}; Segments = 0 }
    $window
}

function Get-TrayBrush($window, [string]$hex) {
    $cache = $window.Tag.Brush
    if (-not $cache.ContainsKey($hex)) { $brush = [Windows.Media.SolidColorBrush][Windows.Media.ColorConverter]::ConvertFromString($hex); $brush.Freeze(); $cache[$hex] = $brush }
    $cache[$hex]
}

# The soft light a TV throws on the wall, in its screen's colour.
function Get-TrayGlow($window, [string]$hex) {
    $cache = $window.Tag.Glow
    if (-not $cache.ContainsKey($hex)) {
        $c = [Windows.Media.ColorConverter]::ConvertFromString($hex)
        $brush = New-Object Windows.Media.RadialGradientBrush ([Windows.Media.Color]::FromArgb(170, $c.R, $c.G, $c.B)), ([Windows.Media.Color]::FromArgb(0, $c.R, $c.G, $c.B))
        $brush.Freeze(); $cache[$hex] = $brush
    }
    $cache[$hex]
}

function Get-TrayMouth($window, [string]$shape) {
    $cache = $window.Tag.Mouth
    if (-not $cache.ContainsKey($shape)) {
        $data = @{ smile = 'M1,1 Q5,6 9,1'; flat = 'M1,3 L9,3'; o = 'M2.5,3.5 A2.5,3 0 1 1 7.5,3.5 A2.5,3 0 1 1 2.5,3.5 Z' }[$shape]
        $cache[$shape] = [Windows.Media.Geometry]::Parse($data)
    }
    $cache[$shape]
}

# The agent's colour at 22% over a dark screen: an idle TV still says whose it is.
function Get-DimColor([string]$hex) {
    $c = [Windows.Media.ColorConverter]::ConvertFromString($hex); $base = @(0x1A, 0x19, 0x18)
    '#{0:X2}{1:X2}{2:X2}' -f [int]($c.R * 0.22 + $base[0] * 0.78), [int]($c.G * 0.22 + $base[1] * 0.78), [int]($c.B * 0.22 + $base[2] * 0.78)
}

function Set-TvFace($window, [int]$n, $face, [string]$ink) {
    $eyes = @($window.FindName("EyeL$n"), $window.FindName("EyeR$n")); $mouth = $window.FindName("Mouth$n"); $mark = $window.FindName("Mark$n")
    $size = @{ open = @(6, 7); wide = @(8, 9); squint = @(7, 3); closed = @(7, 2) }[$face.Eyes]
    foreach ($e in $eyes) {
        if ($size) { $e.Visibility = 'Visible'; $e.Width = $size[0]; $e.Height = $size[1]; $e.Fill = Get-TrayBrush $window $ink } else { $e.Visibility = 'Collapsed' }
    }
    if ($face.Mouth -eq 'none') { $mouth.Visibility = 'Collapsed' } else { $mouth.Visibility = 'Visible'; $mouth.Data = Get-TrayMouth $window $face.Mouth; $mouth.Stroke = Get-TrayBrush $window $ink }
    $mark.Text = $face.Mark; $mark.Foreground = Get-TrayBrush $window $ink
    $window.FindName("NoSignal$n").Visibility = if ($face.Eyes -eq 'none') { 'Visible' } else { 'Collapsed' }
}

# One segment per task in the plan: done ones solid, the running one blinking, the rest dark.
function Set-TrayProgress($window, $progress, [string]$color, [bool]$blinkOn) {
    $grid = $window.FindName('Progress')
    if ($null -eq $progress) { $grid.Visibility = 'Collapsed'; return }
    $grid.Visibility = 'Visible'
    if ($grid.Children.Count -ne $progress.Total) {
        $grid.Children.Clear(); $grid.ColumnDefinitions.Clear()
        for ($i = 0; $i -lt $progress.Total; $i++) {
            $grid.ColumnDefinitions.Add((New-Object Windows.Controls.ColumnDefinition))
            $segment = New-Object Windows.Controls.Border -Property @{ CornerRadius = 2; Margin = '1,0' }
            [Windows.Controls.Grid]::SetColumn($segment, $i); [void]$grid.Children.Add($segment)
        }
    }
    for ($i = 0; $i -lt $progress.Total; $i++) {
        $segment = $grid.Children[$i]
        $segment.Background = Get-TrayBrush $window $(if ($i -lt $progress.Current) { $color } else { '#3A322B' })
        $segment.Opacity = if ($i -eq $progress.Current - 1 -and -not $blinkOn) { 0.4 } else { 1 }
    }
}

# $blinkOn: the needs-you screen, the LIVE / WAIT lights and the running task dim on alternate half-seconds while the
# window shows. $memory is the header's meter (Get-MemoryLine); empty leaves it as it is.
function Set-TrayRemote($window, $tray, [string]$selected, [int]$index, [string]$power, [bool]$blinkOn = $true, [string]$memory = '') {
    $find = { param($name) $window.FindName($name) }
    for ($n = 0; $n -lt 3; $n++) {
        $id = $script:TrayIds[$n]
        $tv = if ($tray) { @($tray.tvs | Where-Object { $_.id -eq $id })[0] } else { $null }
        $mood = if ($tv) { [string]$tv.mood } else { 'offline' }
        $screen = & $find "Screen$n"; $glow = & $find "Glow$n"; $led = & $find "Led$n"
        $screen.Opacity = 1; $glow.Opacity = 0
        switch ($mood) {
            { $_ -in @('working','reviewing') } {
                $screen.Background = Get-TrayBrush $window $script:TrayColors[$id]; $ink = '#1A1410'
                $glow.Fill = Get-TrayGlow $window $script:TrayColors[$id]; $glow.Opacity = 1; $led.Fill = Get-TrayBrush $window '#E24B4A'
            }
            'stuck' {
                $screen.Background = Get-TrayBrush $window '#EF9F27'; $screen.Opacity = if ($blinkOn) { 1 } else { 0.55 }; $ink = '#3C3489'
                $glow.Fill = Get-TrayGlow $window '#EF9F27'; $glow.Opacity = if ($blinkOn) { 1 } else { 0.4 }; $led.Fill = Get-TrayBrush $window '#EF9F27'
            }
            'offline' { $screen.Background = $window.Resources['Static']; $ink = '#888780'; $led.Fill = Get-TrayBrush $window '#3A3936' }
            default { $screen.Background = Get-TrayBrush $window (Get-DimColor $script:TrayColors[$id]); $ink = '#888780'; $led.Fill = Get-TrayBrush $window '#5DCAA5' }
        }
        Set-TvFace $window $n (Get-TvFace $mood) $ink
        $chosen = $id -eq $selected
        (& $find "TvBody$n").BorderBrush = Get-TrayBrush $window $(if ($chosen) { '#F3D6A6' } else { '#5C4838' })
        (& $find "Plate$n").Opacity = if ($chosen) { 1 } else { 0.55 }
        (& $find "Pick$n").BorderBrush = Get-TrayBrush $window $(if ($chosen) { '#F1EFE8' } else { '#00000000' })
        $words = if ($tv) { "$($tv.headline), $($tv.sub)" } else { 'no signal' }
        [Windows.Automation.AutomationProperties]::SetName((& $find "Tv$n"), "$($script:TrayNames[$id]): $words")
        (& $find "Tv$n").ToolTip = if ($tv) { "$($tv.headline)`n$($tv.sub)" } else { "$($script:TrayNames[$id]): no signal" }
    }
    $air = Get-OnAir $tray
    $onAir = @{ live = @('#E24B4A', '#FFFFFF', 'ON AIR'); wait = @('#EF9F27', '#2C2C2A', 'NEEDS YOU'); off = @('#2A211B', '#6B5F55', 'ON AIR') }[$air]
    (& $find 'OnAir').Background = Get-TrayBrush $window $onAir[0]
    (& $find 'OnAir').Opacity = if ($air -eq 'wait' -and -not $blinkOn) { 0.6 } else { 1 }
    (& $find 'OnAirText').Text = $onAir[2]; (& $find 'OnAirText').Foreground = Get-TrayBrush $window $onAir[1]
    (& $find 'OnAirDot').Fill = Get-TrayBrush $window $(if ($air -eq 'off') { '#5F5E5A' } else { $onAir[1] })
    if ($memory) { (& $find 'Memory').Text = $memory }
    $lower = Get-LowerThird $tray $selected $index
    (& $find 'Channel').Text = $lower.Channel
    (& $find 'Bug').Text = $lower.Bug
    $dot = @{ LIVE = '#E24B4A'; WAIT = '#EF9F27'; IDLE = '#888780'; OFF = '#5F5E5A' }[$lower.Bug]
    (& $find 'BugDot').Fill = Get-TrayBrush $window $(if ($dot) { $dot } else { '#888780' })
    (& $find 'BugDot').Opacity = if ($lower.Bug -in @('LIVE','WAIT') -and -not $blinkOn) { 0.35 } else { 1 }
    (& $find 'Headline').Text = $lower.Headline
    (& $find 'Sub').Text = $lower.Sub
    (& $find 'Banner').Background = Get-TrayBrush $window $lower.Banner
    (& $find 'Accent').Fill = Get-TrayBrush $window $(if ($tray) { $script:TrayColors[$selected] } else { '#5F5E5A' })
    $live = $lower.Bug -eq 'LIVE' -and $lower.Index -eq 0
    Set-TrayProgress $window $(if ($live) { Get-TaskProgress $lower.Sub } else { $null }) $script:TrayColors[$selected] $blinkOn
    (& $find 'Today').Text = if ($tray) { Get-TodayLine $lower.Count } else { '' }
    $open = if ($null -eq $tray) { 'Show the launcher' } elseif ($lower.SessionId) { 'Open this session in Hub' } else { 'Open the agent room in Hub' }
    [Windows.Automation.AutomationProperties]::SetName((& $find 'Lower'), "$($lower.Headline), $($lower.Sub). $open")
    $arrows = if ($lower.Count -gt 1) { 'Visible' } else { 'Hidden' }
    (& $find 'Prev').Visibility = $arrows; (& $find 'Next').Visibility = $arrows
    (& $find 'Prev').IsEnabled = $lower.Index -gt 0; (& $find 'Next').IsEnabled = $lower.Index -lt $lower.Count - 1
    (& $find 'Position').Text = if ($lower.Count -gt 1) { "$($lower.Index + 1)/$($lower.Count)" } else { '' }
    (& $find 'Folder').Visibility = if ($tray -and $tray.buildsRoot) { 'Visible' } else { 'Collapsed' }
    $powerButton = & $find 'Power'; $powerText = & $find 'PowerText'
    switch -Wildcard ($power) {
        'off' { $powerButton.Background = Get-TrayBrush $window '#5F5E5A'; $powerText.Text = 'HUB'; $name = 'Turn Hub on' }
        'starting' { $powerButton.Background = Get-TrayBrush $window '#BA7517'; $powerText.Text = 'STARTING'; $name = 'Hub is starting' }
        'closing:*' { $m = $power.Split(':')[1]; $powerButton.Background = Get-TrayBrush $window '#444441'; $powerText.Text = "OFF IN ${m}m"; $name = "Turn Hub off (it closes by itself in $m minutes)" }
        default { $powerButton.Background = Get-TrayBrush $window '#0F6E56'; $powerText.Text = 'HUB ON'; $name = 'Turn Hub off' }
    }
    [Windows.Automation.AutomationProperties]::SetName($powerButton, $name)
    $lower
}
