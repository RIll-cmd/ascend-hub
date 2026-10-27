using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Ascend.Desktop {
    public sealed class RoomEnv { public int Port; public string Token; }

    // The agent room as the launcher's own process, in its own job, so stopping Hub never stops a session. A room
    // already answering on the port with this checkout's token is adopted: used, never stopped or replaced.
    public sealed class RoomHost : IDisposable {
        readonly string nodeExe, hubRoot, script; readonly object gate = new object();
        readonly List<DateTime> exits = new List<DateTime>(); readonly Timer watch;
        ProcessHost child; bool stopping, disposed, ticking; int generation; DateTime checkedAt = DateTime.MinValue;
        public string State { get; private set; }
        public string FailureCode { get; private set; }
        public bool Owned { get; private set; }
        public int Pid { get; private set; }
        public RoomEnv Env { get; private set; }
        public string EnvFile { get { return Path.Combine(hubRoot, ".env.local"); } }

        public RoomHost(string nodeExe, string hubRoot, string script = "scripts/agent-room/server.mjs") {
            this.nodeExe = nodeExe; this.hubRoot = hubRoot; this.script = script;
            State = "stopped"; FailureCode = ""; Env = ReadEnv(EnvFile);
            watch = new Timer(_ => Tick(), null, 1000, 1000);
        }

        public static RoomEnv ReadEnv(string envFile) {
            string text = File.Exists(envFile) ? File.ReadAllText(envFile) : "";
            Func<string, string> value = name => { var m = Regex.Match(text, "^" + name + "=([\"']?)([^\"'\\s]+)\\1\\s*$", RegexOptions.Multiline); return m.Success ? m.Groups[2].Value : null; };
            int port; return new RoomEnv { Port = Int32.TryParse(value("ASCEND_ROOM_PORT"), out port) && port > 0 ? port : 5181, Token = value("ASCEND_ROOM_TOKEN") };
        }

        // At most 3 restarts in 10 minutes: a fourth exit inside the window gives up.
        public static bool ShouldRestart(IList<DateTime> recentExitsUtc, DateTime nowUtc) {
            return recentExitsUtc.Count(at => nowUtc - at < TimeSpan.FromMinutes(10)) <= 3;
        }

        // This checkout's room: GET /tray answers 200 with the token from .env.local.
        public static bool Answers(RoomEnv env) {
            if (env == null || String.IsNullOrEmpty(env.Token)) return false;
            try {
                var request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + env.Port + "/tray");
                request.Proxy = null; request.Timeout = 2000; request.ReadWriteTimeout = 2000; request.Headers["Authorization"] = "Bearer " + env.Token;
                using (var response = (HttpWebResponse)request.GetResponse()) return response.StatusCode == HttpStatusCode.OK;
            } catch { return false; }
        }

        public void Start() {
            lock (gate) { if (disposed || State == "starting" || State == "running" || State == "adopted") return; stopping = false; State = "starting"; FailureCode = ""; generation++; }
            int mine = generation;
            Task.Run(() => StartCore(mine));
        }

        void StartCore(int mine) {
            var env = ReadEnv(EnvFile);
            if (HubSessionConflict.PortBusy(env.Port)) {
                bool ours = Answers(env);
                lock (gate) { if (mine != generation) return; Env = env; Owned = false; State = ours ? "adopted" : "failed"; FailureCode = ours ? "" : "room-port-in-use"; }
                return;
            }
            Spawn(mine, env);
        }

        void Spawn(int mine, RoomEnv env) {
            var next = new ProcessHost();
            string log = Path.Combine(hubRoot, ".sites-runtime", "agent-room", "room.log");
            try {
                Directory.CreateDirectory(Path.GetDirectoryName(log));
                // The room's own log, as when Hub spawned it; it holds the room's status lines, not credentials.
                next.Output += line => { try { File.AppendAllText(log, line + Environment.NewLine); } catch { } };
                next.Start(nodeExe, new[] { script }, hubRoot, new Dictionary<string, string> { { "ASCEND_ROOM_IDLE_MS", "0" }, { "ASCEND_ROOM_PORT", env.Port.ToString() } });
            } catch { next.Dispose(); lock (gate) { if (mine == generation) { State = "failed"; FailureCode = "room-start-failed"; } } return; }
            lock (gate) { if (mine != generation || disposed) { next.Stop(); next.Dispose(); return; } child = next; Pid = next.Pid; Owned = true; }
            var started = DateTime.UtcNow;
            while ((DateTime.UtcNow - started).TotalSeconds < 20) {
                if (next.HasExited) break;
                // A first run writes the token while it starts, so read it again each time.
                var current = ReadEnv(EnvFile);
                if (Answers(current)) { lock (gate) { if (mine != generation) return; Env = current; State = "running"; } return; }
                Thread.Sleep(250);
            }
            lock (gate) {
                if (mine != generation) return;
                if (next.HasExited) { exits.Add(DateTime.UtcNow); State = "failed"; FailureCode = "room-crashed"; }
                else { try { next.Stop(); } catch { } State = "failed"; FailureCode = "room-start-timeout"; }
            }
        }

        // Every second: an owned room that exited without Stop comes back while the restart budget allows; an adopted
        // room that stopped answering is reported as stopped (checked every 5 seconds).
        void Tick() {
            lock (gate) { if (ticking || disposed) return; ticking = true; }
            try {
                int mine; bool restart = false; RoomEnv env = null;
                lock (gate) {
                    mine = generation;
                    if (State == "running" && Owned && child != null && child.HasExited && !stopping) {
                        exits.Add(DateTime.UtcNow); child.Dispose(); child = null;
                        if (ShouldRestart(exits, DateTime.UtcNow)) { State = "starting"; generation++; mine = generation; restart = true; env = ReadEnv(EnvFile); }
                        else { State = "failed"; FailureCode = "room-crashed"; }
                    }
                }
                if (restart) { Spawn(mine, env); return; }
                if (State == "adopted" && (DateTime.UtcNow - checkedAt).TotalSeconds >= 5) {
                    checkedAt = DateTime.UtcNow;
                    if (!Answers(Env)) lock (gate) { if (mine == generation && State == "adopted") State = "stopped"; }
                }
            } finally { lock (gate) ticking = false; }
        }

        // Ends an owned room's job; an adopted room is only no longer watched.
        public void Stop() {
            ProcessHost ending;
            lock (gate) { stopping = true; generation++; ending = Owned ? child : null; child = null; State = "stopped"; FailureCode = ""; Owned = false; }
            if (ending != null) {
                try { ending.Stop(); for (int i = 0; i < 50 && !ending.IsTreeEmpty; i++) Thread.Sleep(100); } catch { }
                ending.Dispose();
            }
        }

        public void Dispose() {
            lock (gate) { if (disposed) return; }
            watch.Dispose(); Stop();
            lock (gate) disposed = true;
        }
    }
}
