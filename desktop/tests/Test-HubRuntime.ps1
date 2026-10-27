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
  $hubEnv=[Ascend.Desktop.Supervisor]::ChildEnvironment('hub','t','i','b')
  Assert ($hubEnv['ASCEND_ROOM_EXTERNAL'] -eq '1') 'Hub leaves the room to the launcher'
  Assert ($hubEnv['ASCEND_LAUNCH_TOKEN'] -eq 't' -and $hubEnv['ASCEND_INSTANCE_ID'] -eq 'i' -and $hubEnv['ASCEND_BUILD_ID'] -eq 'b') 'launch identity'
  Assert (-not ([Ascend.Desktop.Supervisor]::ChildEnvironment('vision','t','i','b')).ContainsKey('ASCEND_ROOM_EXTERNAL')) 'Vision has no room'
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
  Assert ((Get-AgentSummary $room) -eq '2 of 3 agents, Antigravity offline') 'agent count names the offline one'
  $room.agents.agy.state='ready'
  Assert ((Get-AgentSummary $room) -eq '3 of 3 agents') 'all up'
  $room.agents.agy.state='offline';$room.agents.codex.state='offline'
  Assert ((Get-AgentSummary $room) -eq '1 of 3 agents, Codex and Antigravity offline') 'two offline'
  $disk=Get-DiskSummary @('C:\','D:\ascend-builds','d:\other') @{'C:\'=[int64]40GB;'D:\'=[int64]3GB}
  Assert ($disk.Text -eq 'C: 40 GB free, D: 3 GB free, low' -and $disk.Low) 'disk per drive, low under 5 GB'
  Assert (-not (Get-DiskSummary @('C:\') @{'C:\'=[int64]40GB}).Low) 'disk fine'
  Assert ((Get-DiskSummary @($null,'')).Text -eq 'Not checked') 'no paths'
  Assert ((Get-DiskSummary @('Q:\x') @{}).Text -eq 'Q: unknown') 'unknown drive'
  $room.agents.agy.state='checking';$room.agents.codex.state='checking';$room.agents.claude.state='checking'
  Assert ((Get-AgentSummary $room) -eq 'Starting') 'all checking means starting'
  $edge=Join-Path $root 'msedge.exe';[IO.File]::WriteAllText($edge,'')
  Assert ((Resolve-EdgePath @($null,'','relative\msedge.exe',(Join-Path $root 'nope\msedge.exe'),"`"$edge`"")) -eq $edge) 'first existing rooted msedge, quotes trimmed'
  Assert ($null -eq (Resolve-EdgePath @((Join-Path $env:WINDIR 'System32\cmd.exe')))) 'only msedge.exe accepted'
  Assert ((Resolve-EdgePath @('"C:\x\msedge.exe" --flag','C:\bad|path\msedge.exe',$edge)) -eq $edge) 'odd App Paths values are skipped, not thrown'
  Assert ((Get-HubStepText 'Checking runtime and imports (20 second limit)') -eq 'Checking Node.js') 'runtime step'
  Assert ((Get-HubStepText 'Waiting for authenticated health') -eq 'Waiting for Hub to answer') 'health step'
  Assert ((Get-HubStepText 'Optimizing Hub dependencies') -eq 'Preparing Hub (the first start can take a minute)') 'dev step'
  Assert ((Get-HubStepText 'Building Hub (first start after an update)') -eq 'Building Hub (first start after an update)') 'plain steps pass through'
  'hub runtime checks passed'
} finally { Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue }
