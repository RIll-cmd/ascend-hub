#requires -Version 5.1
[CmdletBinding()]param()
$ErrorActionPreference='Stop'
if ($PSVersionTable.PSVersion.Major -ne 5) { throw 'Run with powershell.exe 5.1.' }
function Assert([bool]$condition,[string]$message){if(-not $condition){throw "FAILED: $message"}}
$desktop=Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Web.Extensions
$refs=@([object].Assembly.Location,[System.Net.IPAddress].Assembly.Location,[System.Linq.Enumerable].Assembly.Location,[System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location)
Add-Type -Path @((Join-Path $desktop 'ProcessHost.cs'),(Join-Path $desktop 'Supervisor.cs')) -ReferencedAssemblies $refs
$root=Join-Path $env:TEMP ('hub-runtime-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory((Join-Path $root 'scripts'))
try {
  $p=New-Object Ascend.Desktop.ComponentProfile
  $p.root=$root;$p.executable=(Join-Path $env:WINDIR 'System32\cmd.exe');$p.buildId='local';$p.runtime='production';$p.port=5199
  $missing=$null;try{[Ascend.Desktop.Supervisor]::Validate($p,'hub',$false,$false)}catch{$missing=$_.Exception.GetBaseException().Message}
  Assert ($missing -eq 'hub-build-missing') "production needs run-framework.mjs (got $missing)"
  [IO.File]::WriteAllText((Join-Path $root 'scripts\run-framework.mjs'),'')
  [Ascend.Desktop.Supervisor]::Validate($p,'hub',$false,$false)
  $arguments=[Ascend.Desktop.Supervisor]::Arguments($p,'hub',$false,$false)
  Assert (($arguments -join ' ') -eq 'scripts/run-framework.mjs serve --port 5199') "production arguments (got $($arguments -join ' '))"
  $p.runtime='development'
  Assert ((([Ascend.Desktop.Supervisor]::Arguments($p,'hub',$false,$false)) -join ' ') -like 'node_modules/vinext/dist/cli.js dev*') 'development unchanged'
  $roots=[string[]]@($root)
  $rf=Join-Path $root 'scripts/run-framework.mjs';$cli=Join-Path $root 'node_modules/vinext/dist/cli.js'
  Assert ([Ascend.Desktop.HubSessionConflict]::KnownEntry($rf,[string[]]@('node',$rf,'serve'),$roots)) 'serve session is a known Hub session'
  Assert ([Ascend.Desktop.HubSessionConflict]::KnownEntry($rf,[string[]]@('node',$rf,'dev'),$roots)) 'dev session still known'
  Assert ([Ascend.Desktop.HubSessionConflict]::KnownEntry($cli,[string[]]@('node',$cli,'start'),$roots)) 'vinext start is known'
  Assert (-not [Ascend.Desktop.HubSessionConflict]::KnownEntry($rf,[string[]]@('node',$rf,'build'),$roots)) 'a build is not a session'
  Assert (-not [Ascend.Desktop.HubSessionConflict]::KnownEntry((Join-Path $env:TEMP 'other.js'),[string[]]@('node','x','serve'),$roots)) 'other scripts are not sessions'
  . (Join-Path $desktop 'LauncherPresentation.ps1')
  Assert ((Get-HubFailureText 'port-in-use') -eq 'Another copy of Hub is using port 5173.') 'port text'
  Assert ((Get-HubFailureText 'child-exit-1') -eq 'Hub stopped unexpectedly.') 'exit text'
  Assert ((Get-HubFailureText 'profile-missing') -eq "Hub isn't set up yet.") 'setup text'
  Assert ((Get-HubFailureText 'weird') -eq "Hub couldn't start.") 'fallback text'
  Assert ((Get-AgentSummary $null) -eq 'Offline') 'no room'
  Assert ((Get-AgentSummary ([pscustomobject]@{online=$false})) -eq 'Offline') 'room offline'
  $room=[pscustomobject]@{online=$true;agents=[pscustomobject]@{codex=[pscustomobject]@{state='ready'};claude=[pscustomobject]@{state='busy'};agy=[pscustomobject]@{state='offline'}}}
  Assert ((Get-AgentSummary $room) -eq '2 of 3 agents') 'agent count'
  $room.agents.agy.state='checking';$room.agents.codex.state='checking';$room.agents.claude.state='checking'
  Assert ((Get-AgentSummary $room) -eq 'Starting') 'all checking means starting'
  $edge=Join-Path $root 'msedge.exe';[IO.File]::WriteAllText($edge,'')
  Assert ((Resolve-EdgePath @($null,'','relative\msedge.exe',(Join-Path $root 'nope\msedge.exe'),"`"$edge`"")) -eq $edge) 'first existing rooted msedge, quotes trimmed'
  Assert ($null -eq (Resolve-EdgePath @((Join-Path $env:WINDIR 'System32\cmd.exe')))) 'only msedge.exe accepted'
  'hub runtime checks passed'
} finally { Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue }
