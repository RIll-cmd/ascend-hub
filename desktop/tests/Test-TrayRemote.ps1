#requires -Version 5.1
# The tray remote's real window, offscreen: every mood renders, controls carry their names, and opening and closing it
# 20 times grows the launcher's working set by less than 15 MB. Run with powershell.exe -STA.
[CmdletBinding()]param()
$ErrorActionPreference='Stop'
if ($PSVersionTable.PSVersion.Major -ne 5) { throw 'Run with powershell.exe 5.1.' }
if ([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') { throw 'Run with powershell.exe -STA.' }
function Assert([bool]$condition,[string]$message){if(-not $condition){throw "FAILED: $message"}}
$desktop=Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing
. (Join-Path $desktop 'LauncherPresentation.ps1')
. (Join-Path $desktop 'TrayRemote.ps1')
function Tv($id,$state,$mood,$bug,$headline,$sub,$banner){[pscustomobject]@{id=$id;state=$state;channel='CH';bug=$bug;mood=$mood;headline=$headline;sub=$sub;banner=$banner;stale=$false}}
$tray=[pscustomobject]@{
  tvs=@((Tv codex idle stuck WAIT 'CODEX · NEEDS YOU' 'approve the plan' '#BA7517'),(Tv claude busy working LIVE 'CLAUDE · CODING' 'task 2/3 · Login form · 4m' '#D97757'),(Tv agy offline offline OFF 'ANTIGRAVITY · OFFLINE' 'CLI not available' '#5F5E5A'))
  lead='codex';running=$true;needs='approve the plan';lastViewerAt=$null;buildsRoot='D:\b'
  today=[pscustomobject]@{codex=@();claude=@([pscustomobject]@{id='s2';headline='RUNNING · 4m ago';sub='Login form'},[pscustomobject]@{id='s1';headline='DONE · 37m ago';sub='Todo app with a much longer title than the lower third can hold'});agy=@()}
}
$window=New-TrayRemote $desktop
$window.WindowStartupLocation='Manual';$window.Left=-10000;$window.Top=-10000;$window.ShowActivated=$false
$pump={$window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background)}
$window.Show();& $pump
$lower=Set-TrayRemote $window $tray 'claude' 0 'on' $true 'HUB 152 MB, ROOM 41 MB'
& $pump
Assert ($window.FindName('Memory').Text -eq 'HUB 152 MB, ROOM 41 MB') 'the memory meter'
Assert ($window.FindName('OnAirText').Text -eq 'NEEDS YOU') 'the header calls you before it says on air'
Assert ($window.FindName('Progress').Visibility -eq 'Visible' -and $window.FindName('Progress').Children.Count -eq 3) 'one progress segment per task'
Assert ($window.FindName('Today').Text -eq '2 sessions today') 'today count'
Assert ($window.FindName('Mark0').Text -eq '!' -and $window.FindName('Mouth0').Visibility -eq 'Visible') 'the stuck TV calls you'
Assert ($window.FindName('NoSignal2').Visibility -eq 'Visible' -and $window.FindName('EyeL2').Visibility -eq 'Collapsed' -and $window.FindName('Mouth2').Visibility -eq 'Collapsed') 'offline: no face, NO SIGNAL'
Assert ($window.FindName('Glow1').Opacity -gt 0 -and $window.FindName('Glow2').Opacity -eq 0) 'a working TV lights the wall'
Assert ([string]$window.FindName('Tv1').ToolTip -like '*Login form*') 'hovering a TV says what it does'
Assert ($window.FindName('Folder').Visibility -eq 'Visible') 'the builds folder button'
Assert ($window.FindName('Headline').Text -eq 'CLAUDE · CODING') 'the running session speaks in the live words'
Assert ([Windows.Automation.AutomationProperties]::GetName($window.FindName('Tv0')) -eq 'Codex: CODEX · NEEDS YOU, approve the plan') 'TV names say what each agent is doing'
Assert ([Windows.Automation.AutomationProperties]::GetName($window.FindName('Tv2')) -eq 'Antigravity: ANTIGRAVITY · OFFLINE, CLI not available') 'offline TV'
Assert ($window.FindName('Screen2').Background -eq $window.Resources['Static']) 'offline shows static'
Assert ($window.FindName('Position').Text -eq '1/2' -and $window.FindName('Next').IsEnabled -and -not $window.FindName('Prev').IsEnabled) 'positions'
[void](Set-TrayRemote $window $tray 'claude' 1 'closing:2' $false)
& $pump
Assert ($window.FindName('Headline').Text -eq 'DONE · 37m ago') 'an earlier session'
Assert ([Windows.Automation.AutomationProperties]::GetName($window.FindName('Power')) -eq 'Turn Hub off (it closes by itself in 2 minutes)') 'closing power state'
Assert ($window.FindName('Screen0').Opacity -lt 1) 'the needs-you screen blinks'
$long=[pscustomobject]@{tvs=@((Tv codex idle idle IDLE ('X'*60) ('y'*80) '#5F5E5A'));lead=$null;running=$false;today=[pscustomobject]@{codex=@()}}
[void](Set-TrayRemote $window $long 'codex' 0 'off');& $pump
Assert ($window.FindName('Folder').Visibility -eq 'Collapsed' -and $window.FindName('Progress').Visibility -eq 'Collapsed') 'no builds folder, no plan'
Assert ($window.FindName('Mark0').Text -eq 'z' -and $window.FindName('OnAirText').Text -eq 'ON AIR') 'an idle TV dozes; the header is dark'
Assert ($window.FindName('Headline').ActualWidth -le 262 -and $window.ActualWidth -le 320) 'a 60-character headline is cut, not widened'
[void](Set-TrayRemote $window $null 'claude' 0 'off')
& $pump
Assert ($window.FindName('Headline').Text -eq 'ROOM CLOSED') 'room closed'
Assert ($window.ActualWidth -le 320 -and $window.ActualHeight -lt 380) "compact (got $($window.ActualWidth) x $($window.ActualHeight))"
$window.Hide();& $pump

$cycle={param([int]$count) for($i=0;$i -lt $count;$i++){
  $window.Show();[void](Set-TrayRemote $window $tray @('codex','claude','agy')[$i%3] ($i%2) 'on' (($i%2) -eq 0));& $pump
  $window.Hide();& $pump
}}
# The first opens load WPF's rendering paths once; the budget is for what repeated opening keeps.
& $cycle 10
[GC]::Collect();[GC]::WaitForPendingFinalizers();[GC]::Collect()
$before=[Diagnostics.Process]::GetCurrentProcess().WorkingSet64
& $cycle 20
[GC]::Collect();[GC]::WaitForPendingFinalizers();[GC]::Collect()
$process=[Diagnostics.Process]::GetCurrentProcess();$process.Refresh()
$growth=($process.WorkingSet64-$before)/1MB
Assert ($growth -lt 15) "20 opens grew the working set by $([math]::Round($growth,1)) MB"
$window.Close()
"tray remote window checks passed (20 opens: +$([math]::Round($growth,1)) MB)"
