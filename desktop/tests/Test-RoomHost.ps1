#requires -Version 5.1
[CmdletBinding()]param([string]$NodeExe = (Get-Command node -ErrorAction Stop).Source)
$ErrorActionPreference='Stop'
if ($PSVersionTable.PSVersion.Major -ne 5) { throw 'Run with powershell.exe 5.1.' }
function Assert([bool]$condition,[string]$message){if(-not $condition){throw "FAILED: $message"}}
function Wait-State($room,[string[]]$states,[int]$seconds=20){$watch=[Diagnostics.Stopwatch]::StartNew();while($watch.Elapsed.TotalSeconds -lt $seconds){if($room.State -in $states){return $room.State};Start-Sleep -Milliseconds 200};$room.State}
function Get-FreePort {$l=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0);$l.Start();$p=$l.LocalEndpoint.Port;$l.Stop();$p}
$desktop=Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Web.Extensions
$refs=@([object].Assembly.Location,[System.Net.IPAddress].Assembly.Location,[System.Linq.Enumerable].Assembly.Location,[System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location)
Add-Type -Path @((Join-Path $desktop 'ProcessHost.cs'),(Join-Path $desktop 'Supervisor.cs'),(Join-Path $desktop 'RoomHost.cs')) -ReferencedAssemblies $refs
# The tray remote's memory meter: a process and everything it started, 0 for a process that is gone.
$self=[Diagnostics.Process]::GetCurrentProcess().WorkingSet64
$child=Start-Process -FilePath $NodeExe -ArgumentList '-e','setTimeout(()=>{},5000)' -WindowStyle Hidden -PassThru
try{Start-Sleep -Milliseconds 500;$child.Refresh();$tree=[Ascend.Desktop.HubSessionConflict]::TreeWorkingSet($PID);Assert ($tree -ge $self*0.8+$child.WorkingSet64*0.8) "the tree counts its children (got $tree)"}finally{$child.Kill()}
Assert ([Ascend.Desktop.HubSessionConflict]::TreeWorkingSet(0) -eq 0 -and [Ascend.Desktop.HubSessionConflict]::TreeWorkingSet(999999) -eq 0) 'no process, no memory'
$fixture=Join-Path $PSScriptRoot 'fixture_room.mjs'
$root=Join-Path $env:TEMP ('room-host-'+[guid]::NewGuid().ToString('N'))
$other=Join-Path $env:TEMP ('room-host-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root);[void][IO.Directory]::CreateDirectory($other)
$hosts=@();$blocker=$null
try {
  $envFile=Join-Path $root '.env.local'
  [IO.File]::WriteAllText($envFile,"A=1`r`nASCEND_ROOM_TOKEN=`"abc`"`r`nASCEND_ROOM_PORT='6001'`r`n")
  $read=[Ascend.Desktop.RoomHost]::ReadEnv($envFile)
  Assert ($read.Port -eq 6001 -and $read.Token -eq 'abc') 'quoted CRLF values'
  [IO.File]::WriteAllText($envFile,"A=1`n")
  $read=[Ascend.Desktop.RoomHost]::ReadEnv($envFile)
  Assert ($read.Port -eq 5181 -and $null -eq $read.Token) 'defaults without a token'

  $now=[DateTime]::UtcNow
  $recent={param([int[]]$minutes) ,([Collections.Generic.List[DateTime]]@($minutes|ForEach-Object{$now.AddMinutes(-$_)}))}
  Assert ([Ascend.Desktop.RoomHost]::ShouldRestart((& $recent 1,2,3),$now)) 'three exits in ten minutes still restart'
  Assert (-not [Ascend.Desktop.RoomHost]::ShouldRestart((& $recent 1,2,3,4),$now)) 'a fourth exit in ten minutes gives up'
  Assert ([Ascend.Desktop.RoomHost]::ShouldRestart((& $recent 1,3,15,18),$now)) 'old exits do not count'

  # First run: no token yet; the room writes one and the host reads it after start.
  $port=Get-FreePort
  [IO.File]::WriteAllText($envFile,"ASCEND_ROOM_PORT=$port`n")
  $a=[Ascend.Desktop.RoomHost]::new($NodeExe,$root,$fixture);$hosts+=$a;$a.Start()
  Assert ((Wait-State $a @('running','failed')) -eq 'running') "owned room starts (got $($a.State) $($a.FailureCode))"
  Assert ($a.Owned -and $a.Env.Token) 'owned, token read after the room wrote it'
  $b=[Ascend.Desktop.RoomHost]::new($NodeExe,$root,$fixture);$hosts+=$b;$b.Start()
  Assert ((Wait-State $b @('adopted','failed','running')) -eq 'adopted') "a room already on the port is adopted (got $($b.State))"
  Assert (-not $b.Owned) 'adopted room is not owned'

  # A port held by something that is not this checkout's room.
  $busy=Get-FreePort;$blocker=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$busy);$blocker.Start()
  [IO.File]::WriteAllText((Join-Path $other '.env.local'),"ASCEND_ROOM_PORT=$busy`nASCEND_ROOM_TOKEN=zzz`n")
  $c=[Ascend.Desktop.RoomHost]::new($NodeExe,$other,$fixture);$hosts+=$c;$c.Start()
  Assert ((Wait-State $c @('failed','running','adopted')) -eq 'failed' -and $c.FailureCode -eq 'room-port-in-use') "foreign port (got $($c.State) $($c.FailureCode))"

  # An owned room that dies comes back.
  $first=$a.Pid;Stop-Process -Id $first -Force
  $sw=[Diagnostics.Stopwatch]::StartNew();while($sw.Elapsed.TotalSeconds -lt 20 -and -not ($a.State -eq 'running' -and $a.Pid -ne $first)){Start-Sleep -Milliseconds 200}
  Assert ($a.State -eq 'running' -and $a.Pid -ne $first) "crashed room restarts (got $($a.State) $($a.Pid))"

  # Stopping the adopted host leaves the owned room alone; stopping the owner ends it.
  $b.Stop()
  Assert ($null -ne (Get-Process -Id $a.Pid -ErrorAction SilentlyContinue)) 'stopping an adopted room never kills it'
  $last=$a.Pid;$a.Stop()
  Assert ($a.State -eq 'stopped') 'owner stopped'
  Start-Sleep -Milliseconds 500
  Assert ($null -eq (Get-Process -Id $last -ErrorAction SilentlyContinue)) 'owned room process ended'
  'room host checks passed'
} finally {
  foreach($h in $hosts){try{$h.Dispose()}catch{}}
  if($blocker){$blocker.Stop()}
  Remove-Item -LiteralPath $root,$other -Recurse -Force -ErrorAction SilentlyContinue
}
