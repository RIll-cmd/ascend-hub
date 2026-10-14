#requires -Version 5.1
[CmdletBinding()]param([string]$NodeExe='D:/node.exe')
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -ne 5){throw 'Use Windows PowerShell 5.1.'}
$desktopDirectory=(Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath
$testRoot=Join-Path $env:TEMP ('ascend-session-replacement-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory((Join-Path $testRoot 'scripts'))
[void][IO.Directory]::CreateDirectory((Join-Path $testRoot 'app/api/health'))
[IO.File]::WriteAllText((Join-Path $testRoot 'app/api/health/route.ts'),'// isolated fixture marker')
Add-Type -AssemblyName System.Web.Extensions,PresentationFramework,PresentationCore,WindowsBase
$references=@([object].Assembly.Location,[Net.IPAddress].Assembly.Location,[Linq.Enumerable].Assembly.Location,[Web.Script.Serialization.JavaScriptSerializer].Assembly.Location)
Add-Type -Path @((Join-Path $desktopDirectory 'ProcessHost.cs'),(Join-Path $desktopDirectory 'Supervisor.cs')) -ReferencedAssemblies $references
function Assert([bool]$condition,[string]$message){if(-not $condition){throw "FAILED: $message"}}
function Get-Port {$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();try{$listener.LocalEndpoint.Port}finally{$listener.Stop()}}
function Wait-Until($predicate,[string]$message) {$clock=[Diagnostics.Stopwatch]::StartNew();while($clock.Elapsed.TotalSeconds -lt 12){if(& $predicate){return};Start-Sleep -Milliseconds 50};throw "Timed out: $message"}
$fixture=@'
import http from 'node:http';
import {spawn} from 'node:child_process';
const port=Number(process.argv.at(-1));
const worker=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
console.log('CHILD='+worker.pid);
http.createServer((req,res)=>{
 if(process.env.ASCEND_LAUNCH_TOKEN && req.headers.authorization!==`Bearer ${process.env.ASCEND_LAUNCH_TOKEN}`){res.writeHead(401).end();return;}
 res.setHeader('content-type','application/json');
 res.end(JSON.stringify({schemaVersion:1,component:'hub',instanceId:process.env.ASCEND_INSTANCE_ID,buildId:process.env.ASCEND_BUILD_ID,state:'ready',capabilities:{ui:'ready',core:'unreachable'}}));
}).listen(port,'127.0.0.1');
'@
[IO.File]::WriteAllText((Join-Path $testRoot 'scripts/run-framework.mjs'),$fixture)
$port=Get-Port
$otherPort=Get-Port
$old=[Ascend.Desktop.ProcessHost]::new()
$unrelated=[Ascend.Desktop.ProcessHost]::new()
$supervisor=$null
$emptyEnvironment=[Collections.Generic.Dictionary[string,string]]::new()
try {
    $old.Start($NodeExe,@('scripts/run-framework.mjs','dev','--port',[string]$port),$testRoot,$emptyEnvironment)
    $unrelated.Start($NodeExe,@('-e',"require('node:net').createServer().listen($otherPort,'127.0.0.1')"),$testRoot,$emptyEnvironment)
    Wait-Until { [Ascend.Desktop.HubSessionConflict]::PortBusy($port) -and [Ascend.Desktop.HubSessionConflict]::PortBusy($otherPort) } 'fixture listeners'
    $verified=[Ascend.Desktop.HubSessionConflict]::Find($NodeExe,$testRoot,$port)
    Assert ($null -ne $verified -and $verified.Pid -eq $old.Pid) 'verifies the actual Hub process, executable and directory'
    Assert ($null -eq [Ascend.Desktop.HubSessionConflict]::Find($NodeExe,$testRoot,$otherPort)) 'unrelated Node listener is not eligible'
    Assert ($null -eq [Ascend.Desktop.HubSessionConflict]::Find($NodeExe,($testRoot+'-different'),$port)) 'different checkout is not eligible'
    $profilePath=Join-Path $testRoot 'profile.json'
    $profile=@{schemaVersion=1;hub=@{root=$testRoot;executable=$NodeExe;buildId='replacement-fixture';port=$port;startupSeconds=8;fixtureArguments=@('scripts/run-framework.mjs','dev','--port',[string]$port)}}
    [IO.File]::WriteAllText($profilePath,($profile | ConvertTo-Json -Depth 5))
    $supervisor=[Ascend.Desktop.Supervisor]::new($profilePath,(Join-Path $testRoot 'logs'),$true,'hub')
    [void]$supervisor.Start('hub',$false)
    Wait-Until { $supervisor.Get('hub').State -eq 'failed' -and $supervisor.Get('hub').CanReplaceSession } 'occupied port failure'
    $failed=$supervisor.Get('hub')
    Assert ($failed.FailureCode -eq 'port-in-use' -and $failed.CanReplaceSession -and $failed.ConflictPid -eq $old.Pid) 'replacement is offered for a verified conflict'
    Assert ($supervisor.StopOtherSessionAndRetry()) 'explicit replacement accepted'
    Assert (-not $supervisor.StopOtherSessionAndRetry()) 'double clicks cannot create another replacement'
    Wait-Until { $supervisor.Get('hub').State -eq 'ready' } 'replacement starts and authenticates'
    Assert ($old.HasExited -and $old.IsTreeEmpty) 'old process and descendant worker stopped'
    Assert (-not $unrelated.HasExited) 'unrelated listener remains alive'
    Assert ($supervisor.Get('hub').Pid -ne $old.Pid -and -not $supervisor.Get('hub').CanReplaceSession) 'new owned instance has no stale replacement action'
    $blockedProfilePath=Join-Path $testRoot 'unrelated-profile.json'
    $profile.hub.port=$otherPort
    [IO.File]::WriteAllText($blockedProfilePath,($profile | ConvertTo-Json -Depth 5))
    $blocked=[Ascend.Desktop.Supervisor]::new($blockedProfilePath,(Join-Path $testRoot 'logs'),$true,'hub')
    try {
        [void]$blocked.Start('hub',$false)
        Wait-Until {$blocked.Get('hub').State -eq 'failed'} 'unrelated conflict'
        Assert (-not $blocked.Get('hub').CanReplaceSession -and -not $blocked.StopOtherSessionAndRetry()) 'supervisor refuses unrelated replacement'
        Assert (-not $unrelated.HasExited) 'refusal never stops the unrelated listener'
    }finally{$blocked.Dispose()}
    # A stored identity cannot authorize stopping a new listener on the old port.
    $newPort=Get-Port
    $staleHost=[Ascend.Desktop.ProcessHost]::new()
    $newHost=[Ascend.Desktop.ProcessHost]::new()
    try {
        $staleHost.Start($NodeExe,@('scripts/run-framework.mjs','dev','--port',[string]$newPort),$testRoot,$emptyEnvironment)
        Wait-Until {[Ascend.Desktop.HubSessionConflict]::PortBusy($newPort)} 'stale fixture'
        $stale=[Ascend.Desktop.HubSessionConflict]::Find($NodeExe,$testRoot,$newPort)
        $staleHost.Stop()
        Wait-Until {-not [Ascend.Desktop.HubSessionConflict]::PortBusy($newPort)} 'old listener released'
        $newHost.Start($NodeExe,@('-e',"require('node:net').createServer().listen($newPort,'127.0.0.1')"),$testRoot,$emptyEnvironment)
        Wait-Until {[Ascend.Desktop.HubSessionConflict]::PortBusy($newPort)} 'new unrelated listener'
        $rejected=$false
        try {$stale.Stop($NodeExe,$testRoot,$newPort,[Threading.CancellationToken]::None)}catch{$rejected=$true}
        Assert ($rejected -and -not $newHost.HasExited) 'changed port owner is rejected without termination'
    }finally{$staleHost.Dispose();$newHost.Dispose()}
    . (Join-Path $desktopDirectory 'LauncherPresentation.ps1')
    $window=New-LauncherWindow $desktopDirectory 'Hub'
    try {
        $window.WindowStartupLocation='Manual';$window.Left=-10000;$window.Top=-10000;$window.ShowInTaskbar=$false
        $window.Show()
        Set-LauncherSnapshot $window $failed 'Hub'
        $window.UpdateLayout()
        Assert ($window.FindName('ReplaceSession').Visibility -eq 'Visible' -and $window.FindName('ReplaceSession').IsEnabled) 'replacement button appears beside retry'
        $button=$window.FindName('ReplaceSession');$composition=$window.FindName('Composition')
        $point=$button.TranslatePoint([Windows.Point]::new(0,0),$composition)
        Assert ($point.X -ge 0 -and $point.X+$button.ActualWidth -le $composition.ActualWidth+1) 'replacement action fits native layout'
        $failed.CanReplaceSession=$false
        Set-LauncherSnapshot $window $failed 'Hub'
        Assert (-not $window.FindName('ReplaceSession').IsEnabled) 'unverified conflict cannot be stopped through UI'
        Set-LauncherSnapshot $window ($supervisor.Get('hub')) 'Hub'
        Assert ($window.FindName('ReplaceSession').Visibility -eq 'Collapsed') 'ready state hides replacement button'
    }finally{$window.Close()}
    'PASS: verified replacement/restart, descendant cleanup, unrelated process protection, changed owner, and launcher action states'
}finally {
    if($null -ne $supervisor){$supervisor.Dispose()}
    $old.Dispose();$unrelated.Dispose()
    # Leave only isolated fixture files for diagnosis; no existing session was touched.
}
