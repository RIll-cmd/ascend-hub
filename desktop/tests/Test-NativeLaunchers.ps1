#requires -Version 5.1
[CmdletBinding()]param([string]$PythonExe='C:/Python314/python.exe')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
function Assert([bool]$condition,[string]$message){if(-not $condition){throw "FAILED: $message"}}
function Wait-For([scriptblock]$predicate,[string]$message,[int]$seconds=15) {
    $clock=[Diagnostics.Stopwatch]::StartNew()
    while($clock.Elapsed.TotalSeconds -lt $seconds){$result=& $predicate;if($result){return $result};Start-Sleep -Milliseconds 100}
    throw "Timed out: $message"
}
function Get-Window([int]$processId) {
    $condition=[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty,$processId)
    [Windows.Automation.AutomationElement]::RootElement.FindFirst([Windows.Automation.TreeScope]::Children,$condition)
}
function Find-Control($window,[string]$id) {
    $condition=[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty,$id)
    $window.FindFirst([Windows.Automation.TreeScope]::Descendants,$condition)
}
function Assert-ClosePrompt($window) {
    [void](Wait-For {
        $button=Find-Control $window 'CloseCancel'
        if($null -eq $button){return $false}
        $bounds=$button.Current.BoundingRectangle;$viewport=$window.Current.BoundingRectangle
        return $bounds.Height -gt 0 -and $bounds.Top -ge $viewport.Top -and $bounds.Bottom -le $viewport.Bottom -and $button.Current.HasKeyboardFocus
    } 'close prompt visible in compact viewport and focused')
}
function Invoke-Control($window,[string]$id){$button=Find-Control $window $id;Assert ($null -ne $button) "control $id exists";$pattern=$button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern);$pattern.Invoke()}
function Get-Port {$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();try{$listener.LocalEndpoint.Port}finally{$listener.Stop()}}
$desktopDirectory=(Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath
$scratch=Join-Path $env:TEMP ('ascend-native-test-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($scratch)
$fixture=Join-Path $PSScriptRoot 'fixture_server.py'
$profilePath=Join-Path $scratch 'profile.json'
$profile=@{schemaVersion=1}
foreach($product in @('hub','vision')) {
    $port=Get-Port
    $profile[$product]=@{root=$PSScriptRoot;executable=$PythonExe;buildId='native-fixture';startupSeconds=10;port=$port;fixtureArguments=@($fixture,'--component',$product,'--port',[string]$port,'--mode','ready')}
}
[IO.File]::WriteAllText($profilePath,($profile|ConvertTo-Json -Depth 5))
$shell=New-Object -ComObject WScript.Shell
foreach($product in @('Hub','Vision')) {
    $link=$shell.CreateShortcut((Join-Path $scratch "$product.lnk"))
    $link.TargetPath=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $link.Arguments="-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $desktopDirectory 'Start-Ascend.ps1')`" -Target $product -ProfilePath `"$profilePath`" -FixtureMode"
    $link.WorkingDirectory=$desktopDirectory
    $link.IconLocation=(Join-Path $desktopDirectory "assets/$($product.ToLowerInvariant()).ico")+',0'
    $link.Save()
}
$hub=$null;$vision=$null;$repeat=$null
try {
    $hub=Start-Process -FilePath (Join-Path $scratch 'Hub.lnk') -PassThru -WindowStyle Hidden
    $vision=Start-Process -FilePath (Join-Path $scratch 'Vision.lnk') -PassThru -WindowStyle Hidden
    $hubWindow=Wait-For {Get-Window $hub.Id} 'Hub window'
    $visionWindow=Wait-For {Get-Window $vision.Id} 'Vision window'
    Assert ($hubWindow.Current.Name -eq 'Ascend Hub') 'Hub shortcut composition'
    Assert ($visionWindow.Current.Name -eq 'Ascend Vision') 'Vision shortcut composition'
    [void](Wait-For {if((Find-Control $hubWindow 'Primary').Current.Name -eq 'Open Hub'){$true}} 'Hub ready')
    [void](Wait-For {if((Find-Control $visionWindow 'Primary').Current.Name -eq 'Open Vision'){$true}} 'Vision ready')
    Assert ((Find-Control $hubWindow 'CoreStatus').Current.Name -eq 'Not checked') 'native Hub Core stays unknown'
    Assert ((Find-Control $visionWindow 'CameraStatus').Current.Name -eq 'Not checked') 'native camera never inferred from UI'
    $visionPattern=$visionWindow.GetCurrentPattern([Windows.Automation.WindowPattern]::Pattern)
    $visionPattern.SetWindowVisualState([Windows.Automation.WindowVisualState]::Minimized)
    $repeat=Start-Process -FilePath (Join-Path $scratch 'Vision.lnk') -PassThru -WindowStyle Hidden
    [void](Wait-For {$repeat.Refresh();$repeat.HasExited} 'repeat shortcut activation exits')
    [void](Wait-For {$visionPattern.Current.WindowVisualState -eq [Windows.Automation.WindowVisualState]::Normal} 'repeat restores existing window')
    Assert (-not $hub.HasExited -and -not $vision.HasExited) 'simultaneous product owners remain alive'
    $hubPattern=$hubWindow.GetCurrentPattern([Windows.Automation.WindowPattern]::Pattern)
    $hubWindow.GetCurrentPattern([Windows.Automation.TransformPattern]::Pattern).Resize(420,460)
    $hubPattern.Close()
    Assert-ClosePrompt $hubWindow
    [void](Wait-For {Find-Control $hubWindow 'CloseCancel'} 'nonblocking close choices')
    Invoke-Control $hubWindow 'CloseCancel'
    Assert ((Find-Control $hubWindow 'Primary').Current.IsEnabled) 'cancel close keeps runtime available'
    $hubPattern.Close();Invoke-Control $hubWindow 'CloseStop'
    [void](Wait-For {if((Find-Control $hubWindow 'Force').Current.IsEnabled){$true}} 'force available during stop')
    Assert (-not (Find-Control $hubWindow 'Primary').Current.IsEnabled) 'stopping cannot open or start'
    $details=Find-Control $hubWindow 'Details';$details.GetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern).Expand()
    Assert ((Find-Control $hubWindow 'Diagnostics').Current.IsEnabled) 'diagnostics stay responsive during stop'
    Assert ((Find-Control $visionWindow 'Primary').Current.Name -eq 'Open Vision') 'closing Hub preserves Vision'
    Invoke-Control $hubWindow 'Force'
    [void](Wait-For {$hub.Refresh();$hub.HasExited} 'Hub owned tree stopped and window closed')
    Assert ((Find-Control $visionWindow 'Primary').Current.Name -eq 'Open Vision') 'Hub disposed without stopping Vision'
    $visionWindow.GetCurrentPattern([Windows.Automation.TransformPattern]::Pattern).Resize(420,460)
    $visionPattern.Close();Assert-ClosePrompt $visionWindow;Invoke-Control $visionWindow 'CloseStop'
    [void](Wait-For {$vision.Refresh();$vision.HasExited} 'Vision graceful stop and close')
    'native fixture shortcuts, simultaneous windows, repeat activation and scoped responsive close checks passed'
} finally {
    # Only windows launched from this test's cloned shortcuts are touched.
    foreach($process in @($hub,$vision)) {
        if($null -ne $process){$process.Refresh();if(-not $process.HasExited){
            $testWindow=Get-Window $process.Id
            if($null -ne $testWindow){try{Invoke-Control $testWindow 'Cancel'}catch{};try{Invoke-Control $testWindow 'Force'}catch{};Start-Sleep -Milliseconds 500;try{$testWindow.GetCurrentPattern([Windows.Automation.WindowPattern]::Pattern).Close()}catch{}}
            $process.Refresh();if(-not $process.HasExited){$process.Kill()}
        }}
    }
}
