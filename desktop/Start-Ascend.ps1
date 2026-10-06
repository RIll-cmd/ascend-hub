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
    function Open-AscendUrl {
        $snapshot=$supervisor.Get($component)
        if($snapshot.State -notin @('ready','degraded') -or [string]::IsNullOrWhiteSpace($snapshot.Url)){return}
        $parsed=[Uri]$snapshot.Url
        if($parsed.Scheme -ne 'http' -or $parsed.Host -ne '127.0.0.1' -or $parsed.UserInfo -ne ''){return}
        $start=New-Object Diagnostics.ProcessStartInfo($parsed.AbsoluteUri);$start.UseShellExecute=$true
        [void][Diagnostics.Process]::Start($start)
    }
    $ui['Primary'].Add_Click({
        $snapshot=$supervisor.Get($component)
        if($snapshot.State -in @('stopped','failed')){[void]$supervisor.Start($component,$false)}
        elseif($snapshot.State -in @('ready','degraded')){
            try {Open-AscendUrl} catch {$ui['ProfileStatus'].Text='Could not open the browser. Check your default browser and try Open again.'}
        }
    })
    $ui['Cancel'].Add_Click({$supervisor.Cancel($component)})
    $ui['Stop'].Add_Click({$supervisor.Stop($component)})
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
            if($productOwner.ActivationPending()){$window.WindowState='Normal';$window.Show();[void]$window.Activate()}
            $snapshot=$supervisor.Get($component)
            Set-LauncherSnapshot $window $snapshot $product
            if($script:closeRequested -and $snapshot.State -eq 'stopped'){$window.Close()}
        } catch {$ui['ProfileStatus'].Text='Status update failed. Expand Diagnostics for local startup information.'}
    })
    $window.Add_Closing({
        $snapshot=$supervisor.Get($component)
        if($snapshot.State -notin @('stopped','failed') -or $snapshot.Owned){
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
    $window.Add_Closed({$timer.Stop();$supervisor.Dispose()})
    Set-LauncherSnapshot $window ($supervisor.Get($component)) $product
    if($SelfTest){$supervisor.Dispose();"launcher-$component-components-loaded";return}
    $timer.Start()
    if($Target -ne 'None'){[void]$supervisor.Start($component,$false)}
    [void]$window.ShowDialog()
} catch {
    if($SelfTest){throw}
    Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
    [void][Windows.MessageBox]::Show("Ascend $product could not open. Check the launcher files and local profile, then run its shortcut again.","Ascend $product startup error",[Windows.MessageBoxButton]::OK,[Windows.MessageBoxImage]::Error)
    exit 1
} finally {
    if($null -ne $supervisor){$supervisor.Dispose()}
    if($null -ne $productOwner){$productOwner.Dispose()}
}
