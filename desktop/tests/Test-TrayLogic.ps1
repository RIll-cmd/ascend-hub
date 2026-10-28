#requires -Version 5.1
[CmdletBinding()]param()
$ErrorActionPreference='Stop'
if ($PSVersionTable.PSVersion.Major -ne 5) { throw 'Run with powershell.exe 5.1.' }
function Assert([bool]$condition,[string]$message){if(-not $condition){throw "FAILED: $message"}}
$desktop=Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName WindowsBase
. (Join-Path $desktop 'LauncherPresentation.ps1')
function Tv([string]$id,[string]$state){[pscustomobject]@{id=$id;state=$state}}
function Tray($tvs,$needs=$null,$running=$false){[pscustomobject]@{tvs=$tvs;needs=$needs;running=$running;lastViewerAt=$null}}

# The launcher's agent line, now read from the room's /tray reply.
Assert ((Get-AgentSummary $null) -eq 'Offline') 'no room'
Assert ((Get-AgentSummary (Tray @((Tv codex checking),(Tv claude checking),(Tv agy checking)))) -eq 'Starting') 'all checking'
Assert ((Get-AgentSummary (Tray @((Tv codex idle),(Tv claude busy),(Tv agy offline)))) -eq '2 of 3 agents, Antigravity offline') 'names the offline one'
Assert ((Get-AgentSummary (Tray @((Tv codex offline),(Tv claude idle),(Tv agy offline)))) -eq '1 of 3 agents, Codex and Antigravity offline') 'two offline'
Assert ((Get-AgentSummary (Tray @((Tv codex idle),(Tv claude idle),(Tv agy idle)))) -eq '3 of 3 agents') 'all up'

# The room line under the launcher's title, whatever Hub is doing.
Assert ((Get-RoomLine 'running' '3 of 3 agents') -eq '3 of 3 agents') 'owned room shows the agents'
Assert ((Get-RoomLine 'adopted' '3 of 3 agents') -eq '3 of 3 agents (started elsewhere)') 'adopted room says so'
Assert ((Get-RoomLine 'starting' 'Offline') -eq 'Starting') 'starting'
Assert ((Get-RoomLine 'failed' 'Offline') -eq 'Agent room stopped') 'failed'
Assert ((Get-RoomLine 'stopped' 'Offline') -eq 'Agent room stopped') 'stopped'

# Auto-stop counts from the later of Hub being ready and the last Hub page.
$now=[DateTime]::Parse('2026-10-27T12:00:00Z').ToUniversalTime()
$iso={param([double]$minutesAgo) $now.AddMinutes(-$minutesAgo).ToString('o')}
Assert ((Get-HubIdleAction $null $now.AddMinutes(-3) $now 10) -eq 'none') 'Hub just started, no page yet'
Assert ((Get-HubIdleAction (& $iso 8.5) $now.AddMinutes(-60) $now 10) -eq 'countdown:2') 'countdown in the last two minutes'
Assert ((Get-HubIdleAction (& $iso 9.5) $now.AddMinutes(-60) $now 10) -eq 'countdown:1') 'last minute'
Assert ((Get-HubIdleAction (& $iso 10) $now.AddMinutes(-60) $now 10) -eq 'stop') 'ten quiet minutes stop Hub'
Assert ((Get-HubIdleAction (& $iso 0.5) $now.AddMinutes(-60) $now 10) -eq 'none') 'a page looked in just now'
Assert ((Get-HubIdleAction (& $iso 60) $now.AddMinutes(-60) $now 0) -eq 'none') '0 minutes turns auto-stop off'
Assert ((Get-HubIdleAction (& $iso 60) $now.AddMinutes(-2) $now 10) -eq 'none') 'a fresh start counts from ready, not an old page'
Assert ((Get-HubIdleAction $null $now.AddMinutes(-60) $now 10 $now.AddMinutes(-1)) -eq 'none') 'a room that just came back has not seen the open page yet'
Assert ((Get-ActivationAction 'ready') -eq 'open' -and (Get-ActivationAction 'degraded') -eq 'open') 'double-click opens a running Hub'
Assert ((Get-ActivationAction 'stopped') -eq 'start' -and (Get-ActivationAction 'failed') -eq 'start') 'double-click starts Hub when it is off'
Assert ((Get-ActivationAction 'starting') -eq 'show') 'while it starts, the launcher shows'

# Tooltip: what you must do, else whether Hub is on; Windows caps it at 63 characters.
Assert ((Get-TrayTooltip (Tray @() 'approve the plan') $true) -eq 'Ascend Hub: approve the plan') 'needs you'
Assert ((Get-TrayTooltip (Tray @()) $true) -eq 'Ascend Hub: Hub on') 'on'
Assert ((Get-TrayTooltip $null $false) -eq 'Ascend Hub: Hub off') 'off without a room'
Assert ((Get-TrayTooltip (Tray @() ('x'*80)) $false).Length -eq 63) 'capped at 63'

# Quit asks first only when a session runs, and says what happens to the room.
Assert ($null -eq (Get-QuitPrompt $false $true)) 'nothing running'
Assert ((Get-QuitPrompt $true $true) -eq 'A session is running. Quit stops it and the agent room.') 'owned room'
Assert ((Get-QuitPrompt $true $false) -eq 'The agent room was started elsewhere and keeps running.') 'adopted room'
'tray logic checks passed'
# The tray remote.
. (Join-Path $desktop 'TrayRemote.ps1')
$lead=[pscustomobject]@{lead='codex'}
Assert ((Get-TraySelection $lead 'agy') -eq 'codex') 'the TV that needs you or works leads'
Assert ((Get-TraySelection ([pscustomobject]@{lead=$null}) 'agy') -eq 'agy') 'else the last one picked'
Assert ((Get-TraySelection $null '') -eq 'claude') 'else Claude'
Assert ((Get-PowerState 'stopped' 'none') -eq 'off' -and (Get-PowerState 'failed' 'none') -eq 'off') 'off'
Assert ((Get-PowerState 'starting' 'none') -eq 'starting' -and (Get-PowerState 'checking' 'none') -eq 'starting') 'starting'
Assert ((Get-PowerState 'ready' 'none') -eq 'on') 'on'
Assert ((Get-PowerState 'ready' 'countdown:2') -eq 'closing:2') 'closing countdown'
$work=[Windows.Rect]::new(0,0,1920,1040)
$p=Get-PopupPlacement $work 300 250 ([Windows.Point]::new(1800,1060))
Assert ($p.Left -eq 1612 -and $p.Top -eq 782) "bottom taskbar (got $($p.Left),$($p.Top))"
$p=Get-PopupPlacement ([Windows.Rect]::new(0,0,1860,1080)) 300 250 ([Windows.Point]::new(1890,1000))
Assert ($p.Left -eq 1552 -and $p.Top -eq 822) "right taskbar (got $($p.Left),$($p.Top))"
$p=Get-PopupPlacement ([Windows.Rect]::new(0,40,1920,1040)) 300 250 ([Windows.Point]::new(100,20))
Assert ($p.Left -eq 8 -and $p.Top -eq 48) "top taskbar, near the left edge (got $($p.Left),$($p.Top))"
$tv={param($id,$bug,$headline,$sub) [pscustomobject]@{id=$id;state='idle';channel='CH 01';bug=$bug;mood='idle';headline=$headline;sub=$sub;banner='#d97757';stale=$false}}
$closed=Get-LowerThird $null 'claude' 0
Assert ($closed.Headline -eq 'ROOM CLOSED' -and $closed.Sub -eq 'start the room from the launcher' -and $closed.Bug -eq 'OFF') 'room closed'
$quiet=[pscustomobject]@{tvs=@((& $tv 'claude' 'IDLE' 'CLAUDE · IDLE' 'ready'));running=$false;today=[pscustomobject]@{claude=@()}}
$l=Get-LowerThird $quiet 'claude' 3
Assert ($l.Headline -eq 'CLAUDE · IDLE' -and $l.Count -eq 0 -and $null -eq $l.SessionId) 'no sessions today: the live words, no arrows'
$busy=[pscustomobject]@{tvs=@((& $tv 'claude' 'LIVE' 'CLAUDE · CODING' 'task 2/3 · Login form · 4m'));running=$true;today=[pscustomobject]@{claude=@(
  [pscustomobject]@{id='s2';headline='RUNNING · 4m ago';sub='Login form'},[pscustomobject]@{id='s1';headline='DONE · 37m ago';sub='Todo app'})}}
$l=Get-LowerThird $busy 'claude' 0
Assert ($l.Headline -eq 'CLAUDE · CODING' -and $l.SessionId -eq 's2' -and $l.Running -and $l.Count -eq 2) 'the running newest session speaks in the live words'
$l=Get-LowerThird $busy 'claude' 1
Assert ($l.Headline -eq 'DONE · 37m ago' -and $l.Sub -eq 'Todo app' -and $l.SessionId -eq 's1' -and -not $l.Running) 'an earlier session'
Assert ((Get-LowerThird $busy 'claude' 9).Index -eq 1) 'the position stops at the oldest'
$k=Get-TrayKey 'D3' 'claude' 2
Assert ($k.Selected -eq 'agy' -and $k.Index -eq 0) '3 picks Antigravity from its newest'
Assert ((Get-TrayKey 'NumPad1' 'agy' 0).Selected -eq 'codex') 'number pad'
Assert ((Get-TrayKey 'Left' 'claude' 0).Index -eq 0 -and (Get-TrayKey 'Right' 'claude' 0).Index -eq 1) 'arrows step'
Assert ((Get-TrayKey 'Escape' 'claude' 0).Close) 'Esc closes'
Assert ((Get-TrayKey 'PageDown' 'claude' 0).Index -eq 1 -and (Get-TrayKey 'PageUp' 'claude' 1).Index -eq 0) 'the mouse wheel steps like the arrows'

# A coding TV's progress through the plan, read from its line of detail.
$t=Get-TaskProgress 'task 2/3 · Login form · 4m'
Assert ($t.Current -eq 2 -and $t.Total -eq 3) 'task 2 of 3'
Assert ($null -eq (Get-TaskProgress 'ready') -and $null -eq (Get-TaskProgress '')) 'no plan, no bar'
Assert ($null -eq (Get-TaskProgress 'task 4/3 · x')) 'a position past the end is ignored'

# The face each mood draws on a TV.
$f=Get-TvFace 'working'; Assert ($f.Eyes -eq 'open' -and $f.Mouth -eq 'smile' -and $f.Mark -eq '') 'working: awake and pleased'
$f=Get-TvFace 'reviewing'; Assert ($f.Eyes -eq 'squint' -and $f.Mouth -eq 'flat') 'reviewing: squints'
$f=Get-TvFace 'stuck'; Assert ($f.Eyes -eq 'wide' -and $f.Mouth -eq 'o' -and $f.Mark -eq '!') 'stuck: calls you'
$f=Get-TvFace 'idle'; Assert ($f.Eyes -eq 'closed' -and $f.Mark -eq 'z') 'idle: dozes'
$f=Get-TvFace 'offline'; Assert ($f.Eyes -eq 'none' -and $f.Mouth -eq 'none') 'offline: static only'

# The header's ON AIR light and memory meter.
$air={param($bugs) [pscustomobject]@{tvs=@($bugs|ForEach-Object{[pscustomobject]@{bug=$_}})}}
Assert ((Get-OnAir $null) -eq 'off') 'no room'
Assert ((Get-OnAir (& $air @('IDLE','LIVE','OFF'))) -eq 'live') 'something works'
Assert ((Get-OnAir (& $air @('LIVE','WAIT','IDLE'))) -eq 'wait') 'needs you beats working'
Assert ((Get-OnAir (& $air @('IDLE','IDLE','OFF'))) -eq 'off') 'all quiet'
Assert ((Get-MemoryLine 159383552 42991616) -eq "HUB 152 MB $([char]0xB7) ROOM 41 MB") 'both running'
Assert ((Get-MemoryLine 0 42991616) -eq "HUB OFF $([char]0xB7) ROOM 41 MB") 'Hub off'
Assert ((Get-MemoryLine 0 0) -eq "HUB OFF $([char]0xB7) ROOM OFF") 'nothing running'
Assert ((Get-MemoryLine 159383552 -1) -eq 'HUB 152 MB') 'a room started elsewhere is not counted'
Assert ((Get-TodayLine 0) -eq 'no sessions today' -and (Get-TodayLine 1) -eq '1 session today' -and (Get-TodayLine 4) -eq '4 sessions today') 'today count'
# PowerShell names ignore case: a script-scope "$script:Tray" would overwrite the tray icon held in $tray.
Assert (-not (Select-String -LiteralPath (Join-Path $desktop 'Start-Ascend.ps1') -Pattern '\$script:tray\b' -Quiet)) 'nothing shadows the tray icon variable'
# The remote's buttons draw their corner radius from Tag, so the launcher keeps each agent id elsewhere.
Assert (-not (Select-String -LiteralPath (Join-Path $desktop 'Start-Ascend.ps1') -Pattern '\$button\.Tag=' -Quiet)) 'remote buttons keep their Tag'
'tray remote logic checks passed'

