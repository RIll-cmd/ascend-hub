using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;
using System.Web.Script.Serialization;
using Ascend.Desktop;

public static class SupervisorRegression {
    static void Assert(bool condition,string message){if(!condition)throw new Exception("Regression: "+message);}
    static int Port(){var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();try{return ((IPEndPoint)listener.LocalEndpoint).Port;}finally{listener.Stop();}}
    static void Profile(string path,string python,string fixture,string mode){int port=Port();var component=new ComponentProfile {root=Path.GetDirectoryName(fixture),executable=python,buildId="regression",port=port,startupSeconds=8,fixtureArguments=new[]{fixture,"--component","vision","--port",port.ToString(),"--mode",mode}};File.WriteAllText(path,new JavaScriptSerializer().Serialize(new Profile {schemaVersion=1,vision=component}));}
    static Snapshot Wait(Supervisor supervisor,string state,int seconds){var clock=Stopwatch.StartNew();while(clock.Elapsed.TotalSeconds<seconds){var view=supervisor.Get("vision");if(view.State==state)return view;Thread.Sleep(30);}throw new Exception("Regression timeout: "+state);}
    static bool Exited(int pid){try{using(var process=Process.GetProcessById(pid)){return process.HasExited;}}catch(ArgumentException){return true;}}
    static Slot Slot(Supervisor supervisor){return ((Dictionary<string,Slot>)typeof(Supervisor).GetField("slots",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(supervisor))["vision"];}
    public static void Run(string profile,string logs,string python,string fixture){
        Profile(profile,python,fixture,"ready");
        using(var entered=new ManualResetEvent(false))using(var release=new ManualResetEvent(false))using(var supervisor=new Supervisor(profile,logs,true,"vision")){
            int pid=0;supervisor.AfterLaunch=child=>{pid=child.Pid;entered.Set();Assert(release.WaitOne(10000),"held spawn release");};
            try{
                supervisor.Start("vision",false);Assert(entered.WaitOne(5000),"spawn entered");
                supervisor.Cancel("vision");Thread.Sleep(150);
                Assert(supervisor.Get("vision").State=="stopping","cancel cannot claim stopped while CreateProcess result is unsettled");
                release.Set();Wait(supervisor,"stopped",5);Assert(Exited(pid),"cancelled spawned process actually exited");
            }finally{release.Set();}
        }
        Profile(profile,python,fixture,"ready");
        using(var oldFinally=new ManualResetEvent(false))using(var releaseFinally=new ManualResetEvent(false))using(var newSpawn=new ManualResetEvent(false))using(var releaseSpawn=new ManualResetEvent(false))using(var supervisor=new Supervisor(profile,logs,true,"vision")){
            int launches=0,finals=0;
            supervisor.BeforeRunFinally=gen=>{if(Interlocked.Increment(ref finals)==1){oldFinally.Set();Assert(releaseFinally.WaitOne(10000),"old finally release");}};
            supervisor.AfterLaunch=child=>{if(Interlocked.Increment(ref launches)==2){newSpawn.Set();Assert(releaseSpawn.WaitOne(10000),"new spawn release");}};
            try{
                supervisor.Start("vision",false);Wait(supervisor,"ready",5);supervisor.Cancel("vision");
                Assert(oldFinally.WaitOne(5000),"old generation finally held");Wait(supervisor,"stopped",5);
                supervisor.Start("vision",false);Assert(newSpawn.WaitOne(5000),"new generation spawn held");
                releaseFinally.Set();Thread.Sleep(150);
                var slot=Slot(supervisor);lock(slot.Gate)Assert(slot.LaunchPending,"old finally cannot clear new launch guard");
                supervisor.Cancel("vision");Thread.Sleep(100);Assert(supervisor.Get("vision").State=="stopping","new held spawn cannot be discarded");
                releaseSpawn.Set();Wait(supervisor,"stopped",5);
            }finally{releaseFinally.Set();releaseSpawn.Set();}
        }
        Profile(profile,python,fixture,"ready-exit");
        using(var supervisor=new Supervisor(profile,logs,true,"vision")){
            supervisor.Start("vision",false);Wait(supervisor,"ready",5);
            supervisor.BeforeForceStop=()=>{throw new InvalidOperationException("fixture-kernel-termination-error");};
            supervisor.ForceStop("vision");var failed=Wait(supervisor,"stop_failed",3);
            Assert(failed.FailureCode=="force-stop-failed" && failed.Owned,"force failure retains owned job and actionable result");
            Thread.Sleep(150);Assert(supervisor.Get("vision").ElapsedSeconds==failed.ElapsedSeconds,"force failure display duration frozen");
            Wait(supervisor,"stopped",6);Assert(!supervisor.Get("vision").Owned,"late exit clears force exception without another request");
        }
        Profile(profile,python,fixture,"health-fails");
        using(var supervisor=new Supervisor(profile,logs,true,"vision")){
            supervisor.Start("vision",false);var ready=Wait(supervisor,"ready",5);var failed=Wait(supervisor,"failed",6);
            Assert(failed.ReachedReady && failed.StartupSeconds==ready.StartupSeconds,"post-ready failure preserves completed startup");
            Assert(failed.UptimeSeconds>1,"post-ready failure records uptime separately");
            Thread.Sleep(150);var frozen=supervisor.Get("vision");
            Assert(failed.StartupSeconds==frozen.StartupSeconds && failed.UptimeSeconds==frozen.UptimeSeconds,"completed startup and failed uptime both freeze");
        }
        // A live descendant remains owned after the original parent exits naturally.
        using(var host=new ProcessHost()){
            int childPid=0;host.Output+=line=>{if(line.StartsWith("ASCEND_FIXTURE_CHILD="))Int32.TryParse(line.Substring(21),out childPid);};
            host.Start(python,new[]{fixture,"--component","vision","--port",Port().ToString(),"--mode","descendant-exit"},Path.GetDirectoryName(fixture),new Dictionary<string,string>());
            var watch=Stopwatch.StartNew();while(!host.HasExited && watch.Elapsed.TotalSeconds<5)Thread.Sleep(30);
            Assert(host.HasExited && childPid>0 && !host.IsTreeEmpty,"parent PID exit is insufficient tree proof");
            host.Stop();watch.Restart();while(!host.IsTreeEmpty && watch.Elapsed.TotalSeconds<5)Thread.Sleep(30);
            Assert(host.IsTreeEmpty && Exited(childPid),"force stop verifies entire job and descendant PID exited");
        }
    }
}
