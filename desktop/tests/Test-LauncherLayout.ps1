#requires -Version 5.1
[CmdletBinding()]param([string]$AuditDirectory)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -ne 5){throw 'Use Windows PowerShell 5.1.'}
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$desktopDirectory=(Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath
. (Join-Path $desktopDirectory 'LauncherPresentation.ps1')
function Assert([bool]$condition,[string]$message){if(-not $condition){throw "FAILED: $message"}}
function Get-VisualChildren($visual) {
    for($i=0;$i -lt [Windows.Media.VisualTreeHelper]::GetChildrenCount($visual);$i++) {
        $child=[Windows.Media.VisualTreeHelper]::GetChild($visual,$i)
        $child
        Get-VisualChildren $child
    }
}
$states=@('stopped','checking','starting','ready','degraded','profile-missing','failed','stopping','stop_failed')
foreach($product in @('Vision','Hub')) {
    $window=New-LauncherWindow $desktopDirectory $product
    $window.Left=-10000;$window.Top=-10000;$window.ShowInTaskbar=$false
    try {
        $window.Show()
        Assert ($null -ne $window.Icon) "$product needs a native window icon"
        Assert ($window.Title -eq "Ascend $product") "$product title"
        if ($product -eq 'Hub') {
            Assert ($window.Width -ge 760 -and $window.Height -le 560) 'Hub uses the approved landscape console window'
            Assert ($window.Resources['Base'].Color.ToString() -eq '#FF141513') 'Hub uses the specified charcoal base'
            Assert ($window.Resources['Surface'].Color.ToString() -eq '#FF222321') 'Hub uses the specified raised-charcoal surface'
            Assert ($window.Resources['Ink'].Color.ToString() -eq '#FFF5E8CF') 'Hub uses the specified ivory text'
            Assert ($window.Resources['Secondary'].Color.ToString() -eq '#FFAAA596') 'Hub uses the specified warm-gray secondary text'
            Assert ($window.Resources['Accent'].Color.ToString() -eq '#FFF0A23B') 'Hub uses the charcoal-console orange accent'
            Assert ($window.FindName('Monitor').ActualWidth -gt $window.FindName('Monitor').ActualHeight) 'Hub monitor is landscape-shaped'
            Assert ($window.Resources['HubArtwork'] -is [Windows.Media.Imaging.BitmapSource]) 'Hub uses the shelf TV image asset in its monitor'
            Assert ($window.Resources['HubArtwork'].PixelWidth -eq 500 -and $window.Resources['HubArtwork'].PixelHeight -eq 500) 'Hub TV asset is fully loaded'
        }
        foreach($scale in @(1,1.5,2)) {
            foreach($width in @(420,520)) {
                $window.Width=$width*$scale;$window.Height=if($product -eq 'Vision'){820*$scale}else{660*$scale}
                $window.Content.LayoutTransform=[Windows.Media.ScaleTransform]::new($scale,$scale)
                foreach($state in $states) {
                    $snapshot=[pscustomobject]@{State=if($state -eq 'profile-missing'){'failed'}else{$state};Stage='Waiting for authenticated local health. This longer stage description verifies text wrapping at minimum window size.';ElapsedSeconds=15;StageElapsedSeconds=3;StartupSeconds=8;RetryCount=1;Recovery=($state -eq 'degraded');FailureCode=if($state -eq 'profile-missing'){'profile-missing'}elseif($state -in @('failed','stop_failed')){'startup-timeout'}else{''};Url=if($state -in @('ready','degraded')){'http://127.0.0.1:12345/'}else{$null};Ui=if($state -in @('ready','degraded')){'ready'}else{$null};Chat=if($state -in @('ready','degraded')){'ready'}else{$null};Camera=if($state -in @('ready','degraded')){'unavailable'}else{$null};Microphone=if($state -in @('ready','degraded')){'disabled'}else{$null};Core=if($state -in @('ready','degraded')){'reauth-required'}else{$null}}
                    Set-LauncherSnapshot $window $snapshot $product
                    $window.UpdateLayout()
                    $primary=$window.FindName('Primary')
                    Assert ($primary.IsEnabled -eq ($state -in @('stopped','failed','profile-missing','ready','degraded'))) "$product $state primary availability"
                    Assert ($window.FindName('Diagnostics').IsEnabled) "$product $state diagnostics remain responsive"
                    Assert (($window.FindName('Cancel').Visibility -eq 'Visible') -eq ($state -in @('checking','starting'))) "$product $state cancel availability"
                    Assert (($window.FindName('Force').Visibility -eq 'Visible') -eq ($state -in @('stopping','stop_failed'))) "$product $state force availability"
                    if($state -eq 'ready'){Assert ($primary.Content -eq "_Open $product") "$product open action"}
                    if($state -eq 'starting'){Assert ($window.FindName('Timing').Text -eq 'Stage 3s / startup 15s') "$product stage and startup duration"}
                    if($state -in @('ready','degraded')) {
                    if($product -eq 'Vision') {
                        Assert ($window.FindName('ChatStatus').Text -eq 'Available') 'verified chat field'
                        Assert ($window.FindName('CameraStatus').Text -eq 'Unavailable') 'camera must not inherit UI readiness'
                        Assert ($window.FindName('MicrophoneStatus').Text -eq 'Disabled') 'microphone capability preserved'
                    } else {Assert ($window.FindName('UiStatus').Text -eq 'Available') 'Hub UI availability separate'}
                    Assert ($window.FindName('CoreStatus').Text -eq 'Sign-in required') 'Core verified status'
                    }
                    $composition=$window.FindName('Composition')
                    foreach($control in @(Get-VisualChildren $composition)) {
                        if($control -is [Windows.Controls.Button] -and $control.IsVisible) {
                            $point=$control.TranslatePoint([Windows.Point]::new(0,0),$composition)
                            Assert ($point.X -ge -1 -and $point.X+$control.ActualWidth -le $composition.ActualWidth+1) "$product $state action clipped at $width/$scale"
                            Assert ($control.ActualHeight -ge 40) "$product action target height"
                            Assert ($null -ne $control.FocusVisualStyle -and $control.Focusable) "$product keyboard focus"
                            Assert ([string]$control.Content -match '_|Starting|Stopping|Could not stop') "$product keyboard labels"
                        }
                        if($control -is [Windows.Controls.TextBlock] -and $control.IsVisible) {
                            $ancestor=[Windows.Media.VisualTreeHelper]::GetParent($control);$buttonText=$false
                            while($null -ne $ancestor -and $ancestor -ne $composition){if($ancestor -is [Windows.Controls.Button]){$buttonText=$true;break};$ancestor=[Windows.Media.VisualTreeHelper]::GetParent($ancestor)}
                            if($buttonText){continue}
                            Assert ($control.TextWrapping -eq 'Wrap') "$product wrapping $($control.Text) $($control.Name)"
                            Assert ($control.ActualHeight+$control.Margin.Top+$control.Margin.Bottom+1 -ge $control.DesiredSize.Height) "$product text vertically clipped"
                        }
                    }
                    if($AuditDirectory -and $width -eq 520 -and ($scale -eq 1 -or $state -eq 'ready')) {
                        [void][IO.Directory]::CreateDirectory($AuditDirectory)
                        $window.FindName('Stage').Text = switch($state) {
                            'stopped' {'Start your local app when you are ready.'}
                            'checking' {'Checking runtime and configuration'}
                            'starting' {'Waiting for authenticated health'}
                            'ready' {'Ready'}
                            'degraded' {if($product -eq 'Vision'){'Chat-only recovery ready'}else{'Interface ready; Core connection not checked'}}
                            'stopping' {'Requesting shutdown'}
                            'stop_failed' {"Could not stop $product. Use Force stop."}
                            'profile-missing' {'Launcher profile missing. Run Install-Ascend.ps1 with your existing configuration.'}
                            default {'Startup deadline reached. Check prerequisites, then Retry.'}
                        }
                        $window.FindName('ProfileStatus').Text='Uses your existing local profile and configuration.'
                        if($state -in @('ready','degraded')){$window.FindName('CoreStatus').Text='Not checked'}
                        $window.UpdateLayout()
                        # Render the full scroll extent, independent of the monitor's native window-size cap.
                        $visual=New-Object Windows.Media.DrawingVisual
                        $drawing=$visual.RenderOpen()
                        $logicalWidth=$composition.ActualWidth+64;$logicalHeight=$composition.ActualHeight+64
                        $drawing.DrawRectangle($window.Background,$null,[Windows.Rect]::new(0,0,$logicalWidth,$logicalHeight))
                        $brush=[Windows.Media.VisualBrush]::new($composition)
                        $drawing.DrawRectangle($brush,$null,[Windows.Rect]::new(32,32,$composition.ActualWidth,$composition.ActualHeight))
                        $drawing.Close()
                        $bitmap=[Windows.Media.Imaging.RenderTargetBitmap]::new([int][math]::Ceiling($logicalWidth*$scale),[int][math]::Ceiling($logicalHeight*$scale),96*$scale,96*$scale,[Windows.Media.PixelFormats]::Pbgra32)
                        $bitmap.Render($visual)
                        $encoder=New-Object Windows.Media.Imaging.PngBitmapEncoder;$encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
                        $path=Join-Path $AuditDirectory "$($product.ToLowerInvariant())-$state-$([int]($scale*100)).png"
                        $stream=[IO.File]::Create($path);try{$encoder.Save($stream)}finally{$stream.Dispose()}
                    }
                }
            }
        }
        $ready=[pscustomobject]@{State='ready';Stage='Ready';ElapsedSeconds=10;StageElapsedSeconds=10;StartupSeconds=5;RetryCount=1;Recovery=$false;FailureCode='';FailureStage='';Url='http://127.0.0.1:12345/';Ui='ready';Chat='ready';Camera=$null;Microphone=$null;Core=$null}
        Set-LauncherSnapshot $window $ready $product
        $window.UpdateLayout();[void]$window.Activate()
        $primary=$window.FindName('Primary');$primary.BringIntoView();[void]$primary.Focus()
        Assert ([Windows.Input.Keyboard]::FocusedElement -eq $primary) "$product primary receives native keyboard focus"
        [void]$primary.MoveFocus([Windows.Input.TraversalRequest]::new([Windows.Input.FocusNavigationDirection]::Next))
        Assert ([Windows.Input.Keyboard]::FocusedElement -eq $window.FindName('Stop')) "$product next keyboard action skips disabled or hidden controls"
        $unknown=[pscustomobject]@{State='degraded';Stage='Health unavailable';ElapsedSeconds=20;StageElapsedSeconds=2;StartupSeconds=8;RetryCount=1;Recovery=$false;FailureCode='';Url=$null;Ui='unknown';Chat=$null;Camera='unchecked';Microphone='unexpected';Core=$null}
        Set-LauncherSnapshot $window $unknown $product
        Assert (-not $window.FindName('Primary').IsEnabled) 'stale health cannot Open or duplicate Start'
        Assert ($window.FindName('CoreStatus').Text -eq 'Not checked') 'unknown Core remains unknown'
        if($product -eq 'Vision'){Assert ($window.FindName('CameraStatus').Text -eq 'Not checked') 'unchecked camera remains unknown';Assert ($window.FindName('ChatStatus').Text -eq 'Not checked') 'missing chat remains unknown'}
        $window.Content.LayoutTransform=[Windows.Media.ScaleTransform]::new(1,1)
        $window.Width=420;$window.Height=460;$window.FindName('CloseActions').Visibility='Visible';$window.FindName('Details').IsExpanded=$true
        $window.UpdateLayout()
        Assert ($window.FindName('Scroll').ScrollableHeight -gt 0) "$product compact window scrolls to recovery and close controls"
        foreach($name in @('CloseCancel','CloseStop','Diagnostics')) {
            $button=$window.FindName($name);$button.BringIntoView();$window.UpdateLayout()
            Assert ($button.IsVisible -and $button.IsEnabled) "$product $name usable when compact"
        }
    } finally {$window.Close()}
}
foreach($value in @('', 'unknown','unchecked','unexpected')){Assert ((Get-CapabilityLabel $value) -eq 'Not checked') "unknown $value"}
'launcher states, bindings, keyboard and 100/150/200% layout checks passed'
