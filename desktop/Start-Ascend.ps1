#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('None', 'Vision', 'Hub')][string]$Target = 'None',
    [string]$ProfilePath = (Join-Path $env:LOCALAPPDATA 'Ascend\Desktop\profile.json'),
    [switch]$SelfTest,
    [switch]$FixtureMode
)
$ErrorActionPreference = 'Stop'
$desktopDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$diagnosticsDirectory = Join-Path $env:LOCALAPPDATA 'Ascend\Desktop\logs'
$product = if ($Target -eq 'Hub') { 'Hub' } else { 'Vision' }
$component = $product.ToLowerInvariant()
try {
    Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Web.Extensions
    $references = @([object].Assembly.Location,[System.Net.IPAddress].Assembly.Location,
        [System.Linq.Enumerable].Assembly.Location,[System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location)
    Add-Type -Path @((Join-Path $desktopDirectory 'ProcessHost.cs'),(Join-Path $desktopDirectory 'Supervisor.cs'),
        (Join-Path $desktopDirectory 'ProductOwner.cs'),(Join-Path $desktopDirectory 'RoomHost.cs')) -ReferencedAssemblies $references
    . (Join-Path $desktopDirectory 'LauncherPresentation.ps1')
    if ($product -eq 'Hub') { Add-Type -AssemblyName System.Windows.Forms, System.Drawing }
    $ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $productOwner = [Ascend.Desktop.ProductOwner]::new($ownerSid, $component)
    if (-not $productOwner.Acquired) {
        if ($productOwner.Outcome -eq 'legacy-owner') {
            [void][Windows.MessageBox]::Show('Close the old combined Ascend launcher before opening this product.', 'Ascend launcher upgrade')
        }
        return
    }
    [Ascend.Desktop.NativeWindow]::SetProductIdentity($component)
    $window = New-LauncherWindow $desktopDirectory $product
    if($FixtureMode){$window.WindowStartupLocation='Manual';$window.Left=-10000;$window.Top=-10000;$window.ShowInTaskbar=$false}
    $ui=@{}
    foreach($name in @('State','Stage','Timing','Primary','Cancel','Stop','Force','Details','Failure',
        'Diagnostics','ProfileStatus','CloseActions','CloseCancel','CloseStop','CoreStatus')) {
        $ui[$name]=$window.FindName($name)
        if($null -eq $ui[$name]){throw "Launcher control missing: $name"}
    }
    if($product -eq 'Hub'){$window.FindName('ReplaceSession').Add_Click({[void]$supervisor.StopOtherSessionAndRetry()})}
    if($product -eq 'Vision'){$ui['ChatRecovery']=$window.FindName('ChatRecovery')}
    $supervisor=[Ascend.Desktop.Supervisor]::new($ProfilePath,$diagnosticsDirectory,[bool]$FixtureMode,$component)
    $script:closeRequested=$false
    $script:quitting=$false;$script:autoOpened=$false;$script:trayHinted=$false;$script:roomClient=$null;$script:trayPolledAt=[DateTime]::MinValue
    # Hub on demand: the launcher owns the agent room (RoomHost), reads the tray remote's view from it, and stops Hub
    # after idleStopMinutes without a Hub page. Fixture runs never start a real room.
    $script:roomHost=$null;$script:Tray=$null;$script:hubReadyAt=$null;$script:IdleAction='none';$script:popupOpen=$false;$script:TrayChanged=$null;$script:idleMinutes=10;$script:attentionShown=$false
    if($product -eq 'Hub' -and -not $FixtureMode){
        try{
            $hubProfile=[Ascend.Desktop.Profile]::Read($ProfilePath).hub
            if($null -ne $hubProfile){$script:roomHost=[Ascend.Desktop.RoomHost]::new($hubProfile.executable,$hubProfile.root);if($null -ne $hubProfile.idleStopMinutes){$script:idleMinutes=[int]$hubProfile.idleStopMinutes}}
        }catch{$script:roomHost=$null}
    }
    function Show-Launcher {$window.Show();$window.WindowState='Normal';[void]$window.Activate()}
    # Edge's App Paths entries first, then its standard install folders; Resolve-EdgePath keeps only a real msedge.exe.
    function Get-EdgeCandidates {
        $values=foreach($key in @('HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe','HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe')){try{[string](Get-ItemProperty -LiteralPath $key -ErrorAction Stop).'(default)'}catch{$null}}
        @($values)+@("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe","$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")
    }
    function Open-AscendUrl {
        $snapshot=$supervisor.Get($component)
        if($snapshot.State -notin @('ready','degraded') -or [string]::IsNullOrWhiteSpace($snapshot.Url)){return}
        $parsed=[Uri]$snapshot.Url
        if($parsed.Scheme -ne 'http' -or $parsed.Host -ne '127.0.0.1' -or $parsed.UserInfo -ne ''){return}
        if($product -eq 'Hub'){
            # Fixture runs never open a browser; they only bring the launcher forward.
            if($FixtureMode){Show-Launcher;return}
            $edge=Resolve-EdgePath (Get-EdgeCandidates)
            if($edge){[void][Diagnostics.Process]::Start($edge,"--app=$($parsed.AbsoluteUri)");return}
        }
        $start=New-Object Diagnostics.ProcessStartInfo($parsed.AbsoluteUri);$start.UseShellExecute=$true
        [void][Diagnostics.Process]::Start($start)
    }
    # GET /tray on the room, one request at a time: every 2 s while the tray remote is open, every 15 s otherwise (and
    # at once with $refresh, which also renews stale readiness). The reply arrives on the UI thread through WebClient.
    function Start-TrayPoll([bool]$refresh=$false) {
        $room=$script:roomHost
        if($null -eq $room -or $room.State -notin @('running','adopted')){
            $script:Tray=$null;$script:HubAgentSummary=Get-RoomLine $(if($room){$room.State}else{'stopped'}) 'Offline'
            if($script:TrayChanged){& $script:TrayChanged};return
        }
        $every=if($script:popupOpen){2}else{15}
        if($null -ne $script:roomClient -or (-not $refresh -and ([DateTime]::UtcNow-$script:trayPolledAt).TotalSeconds -lt $every)){return}
        $script:trayPolledAt=[DateTime]::UtcNow
        $conn=$room.Env
        $client=New-Object Net.WebClient;$client.Proxy=$null;$client.Encoding=[Text.Encoding]::UTF8;$client.Headers['Authorization']="Bearer $($conn.Token)";$script:roomClient=$client
        $client.Add_DownloadStringCompleted({param($sender,$e)
            try{
                $script:Tray=if($e.Error -or $e.Cancelled){$null}else{$e.Result|ConvertFrom-Json}
                $script:HubAgentSummary=Get-RoomLine $script:roomHost.State (Get-AgentSummary $script:Tray)
                $script:HubDisk=Get-DiskSummary @($env:SystemDrive,$(if($script:Tray){$script:Tray.buildsRoot}))
                if($script:TrayChanged){& $script:TrayChanged}
            }catch{$script:Tray=$null}
            finally{$sender.Dispose();$script:roomClient=$null}
        })
        try{$client.DownloadStringAsync([Uri]("http://127.0.0.1:$($conn.Port)/tray"+$(if($refresh){'?refresh=1'}else{''})))}catch{$client.Dispose();$script:roomClient=$null;$script:Tray=$null}
    }
    function Invoke-Quit {
        $prompt=Get-QuitPrompt ([bool]($script:Tray -and $script:Tray.running)) ([bool]($script:roomHost -and $script:roomHost.Owned))
        if($prompt -and -not $FixtureMode -and [Windows.MessageBox]::Show("$prompt Quit anyway?",'Quit Ascend Hub','YesNo','Warning') -ne 'Yes'){return}
        $script:quitting=$true
        $snapshot=$supervisor.Get($component)
        if($snapshot.State -in @('stopped','failed') -and -not $snapshot.Owned){$window.Close();return}
        $supervisor.ForceStop($component)
        Show-Launcher
    }
    $ui['Primary'].Add_Click({
        $snapshot=$supervisor.Get($component)
        if($snapshot.State -in @('stopped','failed')){[void]$supervisor.Start($component,$false)}
        elseif($snapshot.State -in @('ready','degraded')){
            try {Open-AscendUrl} catch {$ui['ProfileStatus'].Text='Could not open the browser. Check your default browser and try Open again.'}
        }
    })
    $ui['Cancel'].Add_Click({$supervisor.Cancel($component)})
    # Hub runs headless (no window to close), so a graceful Stop could only time out; Hub stops its owned tree directly.
    $ui['Stop'].Add_Click({if($product -eq 'Hub'){$supervisor.ForceStop($component)}else{$supervisor.Stop($component)}})
    $ui['Force'].Add_Click({$supervisor.ForceStop($component)})
    if($product -eq 'Vision'){$ui['ChatRecovery'].Add_Click({[void]$supervisor.Start('vision',$true)})}
    $ui['Diagnostics'].Add_Click({
        try {
            [void][IO.Directory]::CreateDirectory($diagnosticsDirectory)
            $start=New-Object Diagnostics.ProcessStartInfo($diagnosticsDirectory);$start.UseShellExecute=$true
            [void][Diagnostics.Process]::Start($start)
        } catch {$ui['ProfileStatus'].Text='Could not open the diagnostics folder.'}
    })
    $ui['ProfileStatus'].Text=if(Test-Path -LiteralPath $ProfilePath){'Uses your existing local profile and configuration.'}else{'Setup required. Run Install-Ascend.ps1 with your existing checkout and configuration paths.'}
    $timer=New-Object Windows.Threading.DispatcherTimer
    $timer.Interval=[TimeSpan]::FromMilliseconds(250)
    $timer.Add_Tick({
        try {
            if($productOwner.ActivationPending()){
                $current=$supervisor.Get($component)
                # A second double-click on a running Hub goes straight to Hub; otherwise it shows the launcher.
                if($product -eq 'Hub' -and -not $FixtureMode -and $current.State -in @('ready','degraded')){try{Open-AscendUrl}catch{Show-Launcher}}
                else{Show-Launcher}
            }
            $snapshot=$supervisor.Get($component)
            if($product -eq 'Hub'){
                if($snapshot.State -in @('ready','degraded') -and -not [string]::IsNullOrWhiteSpace($snapshot.Url)){
                    if(-not $script:autoOpened){$script:autoOpened=$true;try{Open-AscendUrl}catch{$ui['ProfileStatus'].Text="Couldn't open the browser. Press Open Hub to try again."}}
                    if($null -eq $script:hubReadyAt){$script:hubReadyAt=[DateTime]::UtcNow}
                    # Without the room there is no heartbeat to read, so Hub never stops for lack of one.
                    $script:IdleAction=if($script:Tray){Get-HubIdleAction $script:Tray.lastViewerAt $script:hubReadyAt ([DateTime]::UtcNow) $script:idleMinutes}else{'none'}
                    if($script:IdleAction -eq 'stop'){$script:IdleAction='none';$supervisor.ForceStop($component)}
                } else {
                    if($snapshot.State -in @('checking','starting')){$script:autoOpened=$false}
                    $script:hubReadyAt=$null;$script:IdleAction='none'
                }
                Start-TrayPoll
            }
            Set-LauncherSnapshot $window $snapshot $product
            if($null -ne $tray){
                $tray.Text=Get-TrayTooltip $script:Tray ($snapshot.State -in @('ready','degraded'))
                $needs=[bool]($script:Tray -and $script:Tray.needs)
                if($needs -ne $script:attentionShown){$script:attentionShown=$needs;$tray.Icon=if($needs){$attentionIcon}else{$baseIcon}}
            }
            if($script:closeRequested -and $snapshot.State -eq 'stopped'){$window.Close()}
            if($script:quitting -and $snapshot.State -in @('stopped','failed')){$window.Close()}
        } catch {$ui['ProfileStatus'].Text='Status update failed. Expand Diagnostics for local startup information.'}
    })
    $window.Add_Closing({
        $snapshot=$supervisor.Get($component)
        $busy=$snapshot.State -notin @('stopped','failed') -or $snapshot.Owned
        if($product -eq 'Hub'){
            # While Hub runs or the launcher looks after the agent room, it lives in the tray and only Quit closes it;
            # Quit waits for Hub's stop, then the tick closes the window. With neither, closing exits as before.
            if(-not $script:quitting -and ($busy -or $null -ne $script:roomHost)){
                $_.Cancel=$true
                [void]$window.Dispatcher.BeginInvoke([Action]{$window.Hide()})
                if(-not $script:trayHinted -and -not $FixtureMode -and $null -ne $tray){$script:trayHinted=$true;$tray.ShowBalloonTip(4000,'Ascend Hub','Ascend Hub keeps running here. Click the icon for the agents; right-click to quit.',[Windows.Forms.ToolTipIcon]::Info)}
            } elseif($busy){$_.Cancel=$true}
            return
        }
        if($busy){
            $_.Cancel=$true;$ui['CloseActions'].Visibility='Visible'
            $window.UpdateLayout()
            $ui['CloseCancel'].BringIntoView()
            $window.UpdateLayout()
            [void]$window.Activate()
            [void]$ui['CloseCancel'].Focus()
        }
    })
    $ui['CloseCancel'].Add_Click({$script:closeRequested=$false;$ui['CloseActions'].Visibility='Collapsed'})
    $ui['CloseStop'].Add_Click({$script:closeRequested=$true;$supervisor.Stop($component)})
    $tray=$null
    if($product -eq 'Hub'){
        $tray=New-Object Windows.Forms.NotifyIcon
        $baseIcon=New-Object Drawing.Icon (Join-Path $desktopDirectory 'assets\hub.ico');$attentionIcon=New-AttentionIcon $baseIcon
        $tray.Icon=$baseIcon
        $tray.Text='Ascend Hub'
        $menu=New-Object Windows.Forms.ContextMenuStrip
        $menu.Items.Add('Open Hub').Add_Click({try{Open-AscendUrl}catch{Show-Launcher}})
        $menu.Items.Add('Show launcher').Add_Click({Show-Launcher})
        $menu.Items.Add('Stop Hub').Add_Click({try{$supervisor.ForceStop($component)}catch{Show-Launcher}})
        [void]$menu.Items.Add((New-Object Windows.Forms.ToolStripSeparator))
        $menu.Items.Add('Quit').Add_Click({Invoke-Quit})
        $tray.ContextMenuStrip=$menu
        $tray.Add_DoubleClick({if($supervisor.Get($component).State -in @('ready','degraded')){try{Open-AscendUrl}catch{Show-Launcher}}else{Show-Launcher}})
        $tray.Visible=$true
    }
    if($product -eq 'Hub'){$window.FindName('RoomStart').Add_Click({if($script:roomHost){$script:roomHost.Start()}})}
    $window.Add_Closed({$timer.Stop();if($null -ne $tray){$tray.Visible=$false;$tray.Dispose()};if($script:roomHost){$script:roomHost.Dispose()};$supervisor.Dispose();if($product -eq 'Hub'){$window.Dispatcher.InvokeShutdown()}})
    Set-LauncherSnapshot $window ($supervisor.Get($component)) $product
    if($SelfTest){if($null -ne $tray){$tray.Dispose()};$supervisor.Dispose();"launcher-$component-components-loaded";return}
    $timer.Start()
    if($script:roomHost){$script:roomHost.Start()}
    if($Target -ne 'None'){[void]$supervisor.Start($component,$false)}
    # Hiding a ShowDialog window ends its modal loop, so the Hub launcher (which hides to the tray) runs its own dispatcher loop.
    if($product -eq 'Hub'){$window.Show();[Windows.Threading.Dispatcher]::Run()}else{[void]$window.ShowDialog()}
} catch {
    if($SelfTest){throw}
    Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
    [void][Windows.MessageBox]::Show("Ascend $product could not open. Check the launcher files and local profile, then run its shortcut again.","Ascend $product startup error",[Windows.MessageBoxButton]::OK,[Windows.MessageBoxImage]::Error)
    exit 1
} finally {
    if($null -ne $supervisor){$supervisor.Dispose()}
    if($null -ne $productOwner){$productOwner.Dispose()}
}
