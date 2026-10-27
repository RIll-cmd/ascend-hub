#requires -Version 5.1
[CmdletBinding()]param()
$ErrorActionPreference='Stop'
if ($PSVersionTable.PSVersion.Major -ne 5) { throw 'Run with powershell.exe 5.1.' }
function Assert([bool]$condition,[string]$message){if(-not $condition){throw "FAILED: $message"}}
$desktop=Split-Path -Parent $PSScriptRoot
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
