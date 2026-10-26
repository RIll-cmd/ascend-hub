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
        (Join-Path $desktopDirectory 'ProductOwner.cs')) -ReferencedAssemblies $references
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
    $script:quitting=$false;$script:autoOpened=$false;$script:trayHinted=$false;$script:roomClient=$null;$script:roomPolledAt=[DateTime]::MinValue
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
    # One request at a time, at most every 5 seconds; the reply arrives on the UI thread through WebClient's sync context.
    function Start-RoomPoll([string]$url) {
        if($null -ne $script:roomClient -or ([DateTime]::UtcNow-$script:roomPolledAt).TotalSeconds -lt 5){return}
        $script:roomPolledAt=[DateTime]::UtcNow
        $client=New-Object Net.WebClient;$client.Proxy=$null;$script:roomClient=$client
        $client.Add_DownloadStringCompleted({param($sender,$e)
            try{
                $room=if($e.Error -or $e.Cancelled){$null}else{$e.Result|ConvertFrom-Json}
                $script:HubAgentSummary=Get-AgentSummary $room
                $script:HubDisk=Get-DiskSummary @($env:SystemDrive,$(if($room){$room.buildsRoot}))
            }catch{$script:HubAgentSummary='Offline'}
            finally{$sender.Dispose();$script:roomClient=$null}
        })
        try{$client.DownloadStringAsync([Uri]($url+'api/room'))}catch{$client.Dispose();$script:roomClient=$null;$script:HubAgentSummary='Offline'}
    }
    function Invoke-Quit {
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
                    Start-RoomPoll $snapshot.Url
                } elseif($snapshot.State -in @('checking','starting')){$script:autoOpened=$false}
                else{$script:HubAgentSummary='Offline'}
            }
            Set-LauncherSnapshot $window $snapshot $product
            if($null -ne $tray){$tip="Ascend Hub - $($ui['State'].Text)";$tray.Text=$tip.Substring(0,[math]::Min(63,$tip.Length))}
            if($script:closeRequested -and $snapshot.State -eq 'stopped'){$window.Close()}
            if($script:quitting -and $snapshot.State -in @('stopped','failed')){$window.Close()}
        } catch {$ui['ProfileStatus'].Text='Status update failed. Expand Diagnostics for local startup information.'}
    })
    $window.Add_Closing({
        $snapshot=$supervisor.Get($component)
        $busy=$snapshot.State -notin @('stopped','failed') -or $snapshot.Owned
        if($product -eq 'Hub'){
            # A running Hub hides to the tray; Quit waits for the stop, then the tick closes the window.
            if($busy){
                $_.Cancel=$true
                if(-not $script:quitting){
                    [void]$window.Dispatcher.BeginInvoke([Action]{$window.Hide()})
                    if(-not $script:trayHinted -and -not $FixtureMode -and $null -ne $tray){$script:trayHinted=$true;$tray.ShowBalloonTip(4000,'Ascend Hub','Ascend Hub keeps running here. Right-click to stop it.',[Windows.Forms.ToolTipIcon]::Info)}
                }
            }
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
        $tray.Icon=New-Object Drawing.Icon (Join-Path $desktopDirectory 'assets\hub.ico')
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
    $window.Add_Closed({$timer.Stop();if($null -ne $tray){$tray.Visible=$false;$tray.Dispose()};$supervisor.Dispose();if($product -eq 'Hub'){$window.Dispatcher.InvokeShutdown()}})
    Set-LauncherSnapshot $window ($supervisor.Get($component)) $product
    if($SelfTest){if($null -ne $tray){$tray.Dispose()};$supervisor.Dispose();"launcher-$component-components-loaded";return}
    $timer.Start()
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
