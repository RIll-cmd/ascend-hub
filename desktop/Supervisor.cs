using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Ascend.Desktop {
    public sealed class ComponentProfile {
        public string root { get; set; }
        public string executable { get; set; }
        public string buildId { get; set; }
        public string runtime { get; set; }
        public string config { get; set; }
        public string envFile { get; set; }
        public int port { get; set; }
        public string[] fixtureArguments { get; set; }
        public int startupSeconds { get; set; }
    }
    public sealed class Profile {
        public int schemaVersion { get; set; }
        public ComponentProfile hub { get; set; }
        public ComponentProfile vision { get; set; }
        public static Profile Read(string path) {
            string json;
            try { json=File.ReadAllText(path); }
            catch(FileNotFoundException) { throw new InvalidOperationException("profile-missing"); }
            catch(DirectoryNotFoundException) { throw new InvalidOperationException("profile-missing"); }
            catch(UnauthorizedAccessException) { throw new InvalidOperationException("profile-inaccessible"); }
            catch(IOException) { throw new InvalidOperationException("profile-inaccessible"); }
            var profile = new JavaScriptSerializer().Deserialize<Profile>(json);
            if (profile == null || profile.schemaVersion != 1) throw new InvalidOperationException("profile-schema"); return profile;
        }
    }
    public sealed class Snapshot {
        public string Component, InstanceId, BuildId, State, Stage, FailureCode, Url, Capabilities, FailureStage;
        public int Pid, RetryCount, ConflictPid; public bool Owned, Recovery, ReachedReady, CanReplaceSession; public DateTime StartedAt, LastHealthAt;
        public double ElapsedSeconds, StageElapsedSeconds, StartupSeconds, UptimeSeconds, ShutdownSeconds;
        public string Ui, Chat, Camera, Microphone, Core, Ai;
    }
    sealed class Slot {
        public readonly object Gate = new object();
        public Snapshot View; public int Generation; public ProcessHost Child; public CancellationTokenSource Cancel; public string LaunchToken;
        public Stopwatch StartupClock=new Stopwatch(), UptimeClock=new Stopwatch(), ShutdownClock=new Stopwatch(), StageClock=new Stopwatch();
        public string LifecycleKind="";public double FailedShutdownSeconds;
        public bool LaunchPending;public int LaunchGeneration;public HubSessionConflict Conflict;
        public Slot(string name) { View = new Snapshot { Component = name, State = "stopped", Stage = "Not started", FailureCode = "", Capabilities = "" }; }
    }
    public sealed class Supervisor : IDisposable {
        static readonly object LaunchGate = new object();
        readonly Dictionary<string,Slot> slots = new Dictionary<string,Slot> { {"hub", new Slot("hub")}, {"vision", new Slot("vision")} };
        readonly string profilePath, logDirectory, ownedComponent; readonly bool fixtures; bool disposed;
        // Internal deterministic fixture seams; never invoked by production supervisors.
        internal Action<ProcessHost> AfterLaunch {get;set;}internal Action<int> BeforeRunFinally {get;set;}internal Action BeforeForceStop {get;set;}
        public Supervisor(string profilePath, string logDirectory, bool fixtures) { this.profilePath = profilePath; this.logDirectory = logDirectory; this.fixtures = fixtures; }
        public Supervisor(string profilePath,string logDirectory,bool fixtures,string component) : this(profilePath,logDirectory,fixtures) { if(component!="hub" && component!="vision") throw new ArgumentException("component"); ownedComponent=component; }
        void RequireOwner(string component) { if(ownedComponent!=null && ownedComponent!=component) throw new InvalidOperationException("product-owner-mismatch"); }
        public Snapshot Get(string component) {
            var slot = slots[component]; lock (slot.Gate) {
                var v = slot.View;
                return new Snapshot { Component=v.Component, InstanceId=v.InstanceId, BuildId=v.BuildId, State=v.State, Stage=v.Stage, FailureCode=v.FailureCode,FailureStage=v.FailureStage, Url=v.Url, Capabilities=v.Capabilities, Pid=v.Pid, Owned=v.Owned, Recovery=v.Recovery, RetryCount=v.RetryCount, StartedAt=v.StartedAt, LastHealthAt=v.LastHealthAt, ElapsedSeconds=ActiveElapsed(slot), StageElapsedSeconds=slot.StageClock.Elapsed.TotalSeconds, StartupSeconds=slot.StartupClock.Elapsed.TotalSeconds, UptimeSeconds=slot.UptimeClock.Elapsed.TotalSeconds, ShutdownSeconds=v.State=="stop_failed"?slot.FailedShutdownSeconds:slot.ShutdownClock.Elapsed.TotalSeconds,ReachedReady=v.ReachedReady, ConflictPid=v.ConflictPid,CanReplaceSession=v.CanReplaceSession && !slot.LaunchPending, Ui=v.Ui,Chat=v.Chat,Camera=v.Camera,Microphone=v.Microphone,Core=v.Core,Ai=v.Ai };
            }
        }
        static double ActiveElapsed(Slot slot) {return slot.LifecycleKind=="startup"?slot.StartupClock.Elapsed.TotalSeconds:slot.LifecycleKind=="uptime"?slot.UptimeClock.Elapsed.TotalSeconds:slot.View.State=="stop_failed"?slot.FailedShutdownSeconds:slot.ShutdownClock.Elapsed.TotalSeconds;}
        public bool Start(string component, bool recovery) {
            if(disposed)throw new ObjectDisposedException("Supervisor");
            RequireOwner(component); var slot = slots[component]; int generation; CancellationToken token;
            lock (slot.Gate) {
                if (slot.View.State != "stopped" && slot.View.State != "failed") return false;
                if (slot.Child != null || slot.LaunchPending) return false;
                slot.Conflict=null;
                slot.LaunchPending=true;slot.StartupClock.Restart();slot.UptimeClock.Reset();slot.ShutdownClock.Reset();slot.StageClock.Restart();slot.LifecycleKind="startup";
                generation = ++slot.Generation;slot.LaunchGeneration=generation; slot.Cancel = new CancellationTokenSource(); token = slot.Cancel.Token;
                slot.View = new Snapshot { Component=component, State="checking", Stage="Checking installation", InstanceId=Guid.NewGuid().ToString("N"), StartedAt=DateTime.UtcNow, Recovery=recovery, RetryCount=slot.View.RetryCount+1, FailureCode="", Capabilities="" };
            }
            Task.Run(() => Run(slot, generation, token)); return true;
        }
        public void Cancel(string component) { ForceStop(component); }
        public bool StopOtherSessionAndRetry() {
            RequireOwner("hub");var slot=slots["hub"];HubSessionConflict conflict;int generation;CancellationToken cancel;
            lock(slot.Gate) {
                if(disposed || slot.View.State!="failed" || !slot.View.CanReplaceSession || slot.Conflict==null || slot.LaunchPending)return false;
                conflict=slot.Conflict;generation=++slot.Generation;slot.Cancel=new CancellationTokenSource();cancel=slot.Cancel.Token;
                slot.LaunchPending=true;slot.LaunchGeneration=generation;slot.View.State="checking";slot.View.Stage="Stopping previous Hub session";slot.View.FailureCode="";slot.View.CanReplaceSession=false;
                slot.StartupClock.Restart();slot.StageClock.Restart();slot.LifecycleKind="startup";
            }
            Task.Run(()=>{
                bool retry=false;
                try {
                    var selected=Profile.Read(profilePath).hub;
                    conflict.Stop(selected.executable,selected.root,Port(selected),cancel);
                    lock(slot.Gate){if(slot.Generation==generation && !cancel.IsCancellationRequested){slot.View.State="stopped";retry=true;}}
                }catch(OperationCanceledException){}
                catch(Exception error){lock(slot.Gate){if(slot.Generation==generation){slot.View.FailureStage=slot.View.Stage;slot.View.State="failed";slot.View.FailureCode=SafeCode(error);slot.View.Stage="Previous session could not be stopped safely. Retry Hub to recheck the port.";slot.View.CanReplaceSession=false;slot.StartupClock.Stop();slot.StageClock.Stop();}}}
                finally {lock(slot.Gate){if(slot.LaunchGeneration==generation)slot.LaunchPending=false;}}
                if(retry){lock(slot.Gate){if(slot.Generation==generation && !disposed)Start("hub",false);}}
            });return true;
        }
        public void Stop(string component) {
            RequireOwner(component); var slot=slots[component]; int generation; string url, launchToken;bool cancelStartup;
            lock(slot.Gate) {
                if(slot.View.State=="stopped" || slot.View.State=="stopping" || slot.View.State=="stop_failed")return;
                cancelStartup=slot.View.State=="checking"||slot.View.State=="starting";
                generation=++slot.Generation; if(slot.Cancel!=null)slot.Cancel.Cancel();
                url=slot.View.Url;launchToken=slot.LaunchToken;
                slot.StartupClock.Stop();slot.UptimeClock.Stop();slot.ShutdownClock.Restart();slot.StageClock.Restart();slot.LifecycleKind="shutdown";
                slot.View.State="stopping";slot.View.Stage="Requesting shutdown"; ClearReadiness(slot);
            }
            // The observer starts with the request, not after the potentially slow HTTP call.
            Task.Run(() => {
                if(component=="vision" && !String.IsNullOrEmpty(url) && !String.IsNullOrEmpty(launchToken))RequestVisionShutdown(url,launchToken);
                lock(slot.Gate) { if(slot.Generation!=generation)return; if(slot.Child!=null && !slot.Child.HasExited)try { Process.GetProcessById(slot.Child.Pid).CloseMainWindow(); }catch(InvalidOperationException){} }
            });
            Task.Run(() => ObserveStop(slot,generation,cancelStartup));
        }
        public void ForceStop(string component) {
            RequireOwner(component);var slot=slots[component];int generation;
            lock(slot.Gate) {
                if(slot.View.State=="stopped" && slot.Child==null)return;
                generation=++slot.Generation;if(slot.Cancel!=null)slot.Cancel.Cancel();
                slot.StartupClock.Stop();slot.UptimeClock.Stop();slot.ShutdownClock.Restart();slot.StageClock.Restart();slot.LifecycleKind="shutdown";
                slot.View.State="stopping";slot.View.Stage="Stopping owned process tree";ClearReadiness(slot);
            }
            Task.Run(() => ObserveStop(slot,generation,true));
        }
        void ObserveStop(Slot slot,int generation,bool force) {
            bool terminated=false;
            while(true) {
                lock(slot.Gate) {
                    if(slot.Generation!=generation)return;
                    if(force && !terminated && slot.Child!=null) {
                        try { if(fixtures && BeforeForceStop!=null)BeforeForceStop();slot.Child.Stop();terminated=true; } catch(Exception) { terminated=true;StopFailed(slot,"force-stop-failed"); }
                    }
                    // Job accounting includes descendants after the original process has exited.
                    if(!slot.LaunchPending && (slot.Child==null || slot.Child.IsTreeEmpty)) { Cleanup(slot);slot.View.State="stopped";slot.View.Stage="Stopped";slot.View.FailureCode="";slot.ShutdownClock.Stop();slot.StageClock.Stop();return; }
                    if(slot.ShutdownClock.Elapsed.TotalSeconds>=15 && slot.View.State=="stopping")StopFailed(slot,force?"force-stop-timeout":"shutdown-timeout");
                }
                Thread.Sleep(100);
            }
        }
        void StopFailed(Slot slot,string code) {slot.View.State="stop_failed";slot.View.Stage="Could not stop "+(slot.View.Component=="hub"?"Hub":"Vision")+". Use Force stop.";slot.View.FailureCode=code;slot.FailedShutdownSeconds=slot.ShutdownClock.Elapsed.TotalSeconds;slot.StageClock.Stop();}
        void ClearReadiness(Slot slot) {slot.View.Url=null;slot.View.Capabilities="";slot.View.Ui=null;slot.View.Chat=null;slot.View.Camera=null;slot.View.Microphone=null;slot.View.Core=null;slot.View.Ai=null;}
        void Cleanup(Slot slot) { if(slot.Child!=null) { slot.Child.Dispose();slot.Child=null; }slot.LaunchToken=null;slot.View.Owned=false;slot.View.Pid=0;ClearReadiness(slot); }
        void Update(Slot slot,int generation,string state,string stage,string failure) {lock(slot.Gate) {if(slot.Generation!=generation)return;if(slot.View.Stage!=stage)slot.StageClock.Restart();slot.View.State=state;slot.View.Stage=stage;slot.View.FailureCode=failure;} }
        void Run(Slot slot,int generation,CancellationToken cancel) {
            ProcessHost child=null; string token=NewToken(); var watch=Stopwatch.StartNew();
            try {
                var profile=Profile.Read(profilePath); string name=slot.View.Component;
                var selected=name=="hub" ? profile.hub : profile.vision;
                Validate(selected,name,fixtures,slot.View.Recovery);
                cancel.ThrowIfCancellationRequested();
                lock(slot.Gate) { if(slot.Generation!=generation) return; slot.View.BuildId=selected.buildId; }
                if(!fixtures) {
                    Update(slot,generation,"checking","Checking runtime and imports (20 second limit)","");
                    Probe(selected,name,cancel);
                }
                if(name=="hub" && HubSessionConflict.PortBusy(Port(selected))) {
                    var conflict=HubSessionConflict.Find(selected.executable,selected.root,Port(selected));
                    lock(slot.Gate){if(slot.Generation!=generation)return;slot.Conflict=conflict;slot.View.CanReplaceSession=conflict!=null;slot.View.ConflictPid=conflict==null?0:conflict.Pid;}
                    throw new InvalidOperationException("port-in-use");
                }
                cancel.ThrowIfCancellationRequested();
                string url=name=="hub" ? "http://127.0.0.1:"+Port(selected)+"/" : null;
                object urlGate=new object();
                child=new ProcessHost();
                child.Output += line => {
                    const string prefix="ASCEND_FAIRY_URL=";
                    if(line.StartsWith(prefix,StringComparison.Ordinal)) {
                        Uri candidate;
                        if(Uri.TryCreate(line.Substring(prefix.Length),UriKind.Absolute,out candidate) && candidate.Scheme=="http" && candidate.Host=="127.0.0.1" && candidate.UserInfo=="" && candidate.AbsolutePath=="/") lock(urlGate) url=candidate.GetLeftPart(UriPartial.Authority)+"/";
                    } else if(line.StartsWith("ASCEND_STAGE=",StringComparison.Ordinal)) {
                        string stage=line.Substring("ASCEND_STAGE=".Length);
                        if(new [] {"config","native_imports","model_initialization","fairy_host","microphone_initialization","camera_initialization","recovery_config","chat_initialization_failed"}.Contains(stage)) {
                            Update(slot,generation,"starting",stage.Replace('_',' '),"");
                        }
                    } else if(name=="hub" && (line.Contains("Re-optimizing dependencies") || line.Contains("bundling dependencies"))) {
                        Update(slot,generation,"starting","Optimizing Hub dependencies","");
                    } else if(name=="hub" && line.Contains("Starting local server")) {
                        Update(slot,generation,"starting","Starting Hub local server","");
                    }
                };
                var env=new Dictionary<string,string> { {"ASCEND_LAUNCH_TOKEN",token}, {"ASCEND_INSTANCE_ID",slot.View.InstanceId}, {"ASCEND_BUILD_ID",selected.buildId}, {"ASCEND_OPEN_BROWSER","0"}, {"ASCEND_DESKTOP_LAUNCH","1"}, {"PYTHONUNBUFFERED","1"} };
                string[] args=Arguments(selected,name,slot.View.Recovery,fixtures);
                // Cancellation cannot interleave between spawning and recording ownership.
                // CreateProcess may block in a Windows security hook; never hold the
                // snapshot lock while it runs, or the UI's 250 ms tick would freeze.
                lock(LaunchGate) child.Start(selected.executable,args,selected.root,env);
                if(fixtures && AfterLaunch!=null)AfterLaunch(child);
                lock(slot.Gate) { if(disposed){child.Dispose();return;} slot.Child=child; slot.LaunchToken=token; slot.View.Pid=child.Pid; slot.View.Owned=true;slot.LaunchPending=false;if(slot.Generation!=generation)return; slot.View.State="starting"; slot.View.Stage="Waiting for authenticated health";slot.StageClock.Restart(); }
                var startup=Stopwatch.StartNew(); int budget=selected.startupSeconds>0?selected.startupSeconds:(name=="hub"?90:60); bool wasReady=false; DateTime lastGood=DateTime.MinValue;
                while(!cancel.IsCancellationRequested) {
                    if(child.HasExited) throw new InvalidOperationException("child-exit-"+child.ExitCode);
                    string currentUrl;lock(urlGate) currentUrl=url;
                    if(currentUrl!=null) {
                        Dictionary<string,object> health=ReadHealth(currentUrl+(name=="hub"?"api/health":"api/fairy/health"),token);
                        if(health!=null) {
                            if(!IdentityMatches(health,name,slot.View.InstanceId,selected.buildId)) throw new InvalidOperationException("health-identity-mismatch");
                            if(Value(health,"state")=="failed") throw new InvalidOperationException("component-health-failed");
                            var caps=health.ContainsKey("capabilities")?health["capabilities"] as Dictionary<string,object>:null;
                            if(caps!=null && Value(caps,"ui")=="ready" && (name=="hub" || Value(caps,"chat")=="ready")) {
                                lastGood=DateTime.UtcNow;
                                lock(slot.Gate) { if(slot.Generation!=generation)return; if(!wasReady){slot.StartupClock.Stop();slot.UptimeClock.Restart();slot.StageClock.Restart();slot.LifecycleKind="uptime";slot.View.ReachedReady=true;wasReady=true;} slot.View.State=Value(health,"state")=="degraded"?"degraded":"ready"; slot.View.Stage=slot.View.Recovery?"Chat-only recovery ready":"Ready"; slot.View.Url=currentUrl+(name=="vision"?"?runtime=1":""); slot.View.LastHealthAt=lastGood; slot.View.Capabilities=FormatCapabilities(caps);slot.View.Ui=Value(caps,"ui");slot.View.Chat=Value(caps,"chat");slot.View.Camera=Value(caps,"camera");slot.View.Microphone=Value(caps,"microphone");slot.View.Core=Value(caps,"core");slot.View.Ai=Value(caps,"ai"); slot.View.FailureCode=""; }
                            }
                        }
                    }
                    if(!wasReady && startup.Elapsed.TotalSeconds>budget) throw new InvalidOperationException("startup-timeout");
                    if(wasReady && (DateTime.UtcNow-lastGood).TotalSeconds>5) { lock(slot.Gate) { if(slot.Generation!=generation)return; slot.View.State="degraded";slot.View.Stage="Health unavailable; capabilities unknown";ClearReadiness(slot); } }
                    if(cancel.WaitHandle.WaitOne(1000)) break;
                }
            } catch(OperationCanceledException) { }
            catch(Exception error) {
                string code=SafeCode(error);
                lock(slot.Gate) { if(slot.Generation!=generation)return;slot.View.FailureStage=slot.View.Stage; Cleanup(slot);slot.View.State="failed";slot.View.Stage=Repair(code);slot.View.FailureCode=code;slot.StartupClock.Stop();slot.UptimeClock.Stop();slot.StageClock.Stop(); }
                Log(slot.View.Component,code,watch.ElapsedMilliseconds);
            } finally { if(fixtures && BeforeRunFinally!=null)BeforeRunFinally(generation);lock(slot.Gate) { if(slot.LaunchGeneration==generation)slot.LaunchPending=false; } }
        }
        public static void Validate(ComponentProfile p,string component,bool fixtures,bool recovery) {
            if(p==null) throw new InvalidOperationException("profile-missing");
            if(String.IsNullOrWhiteSpace(p.root)||!Path.IsPathRooted(p.root)||!Directory.Exists(p.root)) throw new InvalidOperationException("root-missing");
            if(String.IsNullOrWhiteSpace(p.executable)||!Path.IsPathRooted(p.executable)||!File.Exists(p.executable)) throw new InvalidOperationException("runtime-missing");
            if(String.IsNullOrWhiteSpace(p.buildId)) throw new InvalidOperationException("build-id-missing");
            if(fixtures) return;
            if(component=="hub") {
                if(p.runtime!="development" && p.runtime!="portable") throw new InvalidOperationException("runtime-profile");
                string artifact=p.runtime=="portable"?"dist/server/wrangler.json":"node_modules/vinext/dist/cli.js";
                if(!File.Exists(Path.Combine(p.root,artifact))) throw new InvalidOperationException("hub-build-missing");
                if(p.runtime=="portable") {
                    string release=Path.Combine(p.root,"desktop/release.json");
                    if(!File.Exists(release)) throw new InvalidOperationException("release-unverified");
                    var verified=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(release));
                    if(Value(verified,"buildId")!=p.buildId || Value(verified,"verified")!="True") throw new InvalidOperationException("release-unverified");
                }
            } else {
                if(String.IsNullOrWhiteSpace(p.config)||!Path.IsPathRooted(p.config)||!File.Exists(p.config)) throw new InvalidOperationException("config-missing");
                if(String.IsNullOrWhiteSpace(p.envFile)||!Path.IsPathRooted(p.envFile)||!File.Exists(p.envFile)) throw new InvalidOperationException("env-file-missing");
                if(!File.Exists(Path.Combine(p.root,"fairy-ui/dist/index.html"))) throw new InvalidOperationException("fairy-build-missing");
                if(!File.Exists(Path.Combine(p.root,recovery?"desktop_host.py":"main.py"))) throw new InvalidOperationException("entrypoint-missing");
            }
        }
        static int Port(ComponentProfile p) { return p.port>0?p.port:5173; }
        static string[] Arguments(ComponentProfile p,string component,bool recovery,bool fixtures) {
            if(fixtures) return p.fixtureArguments;
            if(component=="vision") return recovery ? new [] {"desktop_host.py","--config",p.config,"--env-file",p.envFile,"--no-open"} : new [] {"main.py","--focus","--config",p.config,"--env-file",p.envFile};
            if(p.runtime=="development") return new [] {"node_modules/vinext/dist/cli.js","dev","--host","127.0.0.1","--port",Port(p).ToString()};
            return new [] {"--import","./scripts/sites-env.mjs","./node_modules/wrangler/bin/wrangler.js","dev","--config","dist/server/wrangler.json","--local","--persist-to",".wrangler/state","--ip","127.0.0.1","--port",Port(p).ToString(),"--inspector-port","0"};
        }
        static void Probe(ComponentProfile p,string component,CancellationToken cancel) {
            string[] args=component=="hub"?new [] {"-e","const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:2)"}:new [] {"-c","import sys; assert sys.version_info >= (3,11); import yaml, dotenv, flask; yaml.safe_load(open(sys.argv[1], encoding='utf-8'))",p.config};
            using(var probe=new ProcessHost()) { lock(LaunchGate)probe.Start(p.executable,args,p.root,new Dictionary<string,string>()); var watch=Stopwatch.StartNew(); while(!probe.HasExited) { cancel.ThrowIfCancellationRequested(); if(watch.Elapsed.TotalSeconds>=20)throw new InvalidOperationException("prerequisite-timeout");cancel.WaitHandle.WaitOne(50); } if(probe.ExitCode!=0)throw new InvalidOperationException("prerequisite-failed"); }
        }
        static Dictionary<string,object> ReadHealth(string url,string token) {
            try { var request=(HttpWebRequest)WebRequest.Create(url);request.Proxy=null;request.Timeout=2000;request.ReadWriteTimeout=2000;request.AllowAutoRedirect=false;request.Headers["Authorization"]="Bearer "+token;
                using(var response=(HttpWebResponse)request.GetResponse()) using(var stream=response.GetResponseStream()) using(var reader=new StreamReader(stream)) { var buffer=new char[16385];int total=0,read;while(total<buffer.Length && (read=reader.Read(buffer,total,buffer.Length-total))>0)total+=read;if(total==buffer.Length)return null;return new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(new string(buffer,0,total)); }
            } catch(WebException) { return null; } catch(ArgumentException) { return null; } catch(InvalidOperationException) { return null; }
        }
        static void RequestVisionShutdown(string url,string token) {
            try {
                var endpoint=new Uri(new Uri(url),"/api/fairy/shutdown");
                if(endpoint.Scheme!="http" || endpoint.Host!="127.0.0.1") return;
                var request=(HttpWebRequest)WebRequest.Create(endpoint);request.Proxy=null;request.Method="POST";
                request.Timeout=2000;request.ReadWriteTimeout=2000;request.ContentLength=0;
                request.Headers["Authorization"]="Bearer "+token;
                using(var response=(HttpWebResponse)request.GetResponse()) { }
            } catch(WebException) { } catch(InvalidOperationException) { }
        }
        public static bool IdentityMatches(Dictionary<string,object> health,string component,string instance,string build) { return Value(health,"schemaVersion")=="1" && Value(health,"component")==component && Value(health,"instanceId")==instance && Value(health,"buildId")==build; }
        static string Value(Dictionary<string,object> data,string key) { object value;return data!=null&&data.TryGetValue(key,out value)&&value!=null?Convert.ToString(value):""; }
        static string FormatCapabilities(Dictionary<string,object> caps) {
            var text=new List<string>();foreach(string name in new [] {"ui","chat","model","camera","microphone","core","ai"}) { string value=Value(caps,name);if(value!="")text.Add(name+": "+(System.Text.RegularExpressions.Regex.IsMatch(value,"^[a-z-]{1,40}$")?value:"unknown")); }return String.Join("  |  ",text);
        }
        static string NewToken() { var bytes=new byte[32];using(var random=RandomNumberGenerator.Create())random.GetBytes(bytes);return Convert.ToBase64String(bytes); }
        static string SafeCode(Exception error) { string code=error is InvalidOperationException?error.Message:"supervisor-error";return System.Text.RegularExpressions.Regex.IsMatch(code,"^[a-z][a-z0-9-]{0,70}$")?code:"supervisor-error"; }
        static string Repair(string code) {
            switch(code) { case "profile-missing":return "Launcher profile missing. Reinstall the desktop shortcuts, then Retry.";case "profile-inaccessible":return "Windows could not read the launcher profile. Check file access or reinstall to an unencrypted folder.";case "startup-timeout":return "Startup deadline reached. Check prerequisites, then Retry.";case "port-in-use":return "Hub port is already in use. Stop the verified Hub session and retry, or close the app using this port yourself.";case "prerequisite-timeout":return "Runtime/import probe stalled after 20 seconds. Repair the selected environment.";case "prerequisite-failed":return "Runtime/import/config check failed. Repair the selected environment; no packages were installed.";case "release-unverified":return "Portable release has not been verified. Use the documented release check.";default:return "Installation/startup failed ("+code+"). Check the profile and desktop README, then Retry."; }
        }
        void Log(string component,string code,long duration) {
            try { Directory.CreateDirectory(logDirectory);foreach(string file in Directory.GetFiles(logDirectory,"session-*.jsonl"))if(File.GetLastWriteTimeUtc(file)<DateTime.UtcNow.AddDays(-14))File.Delete(file);
                var files=new List<string>(Directory.GetFiles(logDirectory,"session-*.jsonl"));files.Sort(StringComparer.Ordinal);while(files.Count>=10){File.Delete(files[0]);files.RemoveAt(0);}
                string path=Path.Combine(logDirectory,"session-"+DateTime.UtcNow.ToString("yyyyMMddTHHmmssfff")+"-"+Guid.NewGuid().ToString("N")+".jsonl");
                // No stdout, exception messages, URLs, environment values, or conversation data are serialized.
                File.WriteAllText(path,new JavaScriptSerializer().Serialize(new { component=component,stage=code,durationMs=duration,at=DateTime.UtcNow.ToString("o") })+Environment.NewLine);
            } catch(IOException) { } catch(UnauthorizedAccessException) { }
        }
        public void Dispose() { disposed=true;foreach(var pair in slots) {if(ownedComponent!=null && ownedComponent!=pair.Key)continue;var slot=pair.Value;lock(slot.Gate){slot.Generation++;if(slot.Cancel!=null)slot.Cancel.Cancel();Cleanup(slot);} } }
    }
}
