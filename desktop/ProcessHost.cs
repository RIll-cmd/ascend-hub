using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace Ascend.Desktop {
    // A port number is not permission to terminate a process. Keep a verified
    // identity and recheck it on the explicit replacement action.
    public sealed class HubSessionConflict {
        public int Pid { get; private set; }
        public long StartedTicks { get; private set; }
        string directory, command;
        public static bool PortBusy(int port) { return System.Net.NetworkInformation.IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(endpoint=>endpoint.Port==port); }
        public static HubSessionConflict Find(string executable,string root,int port) {
            try {
                var ids=Listeners(port); if(ids.Count!=1)return null;
                int pid=ids[0];
                using(var process=System.Diagnostics.Process.GetProcessById(pid)) {
                    if(!SameUser(process.Handle)||!EqualPath(process.MainModule.FileName,executable))return null;
                    string cwd=Parameter(process.Handle,false), cmd=Parameter(process.Handle,true);
                    string full=System.IO.Path.GetFullPath(root).TrimEnd('\\');
                    string other=full;
                    int worktree=full.IndexOf("\\.worktrees\\",StringComparison.OrdinalIgnoreCase);
                    if(worktree>=0)other=full.Substring(0,worktree);
                    if(!EqualPath(cwd,full)&&!EqualPath(cwd,other))return null;
                    if(!System.IO.File.Exists(System.IO.Path.Combine(cwd,"app/api/health/route.ts")))return null;
                    string[] args=Arguments(cmd);if(args.Length<2)return null;
                    string entry=System.IO.Path.IsPathRooted(args[1])?args[1]:System.IO.Path.Combine(cwd,args[1]);
                    bool known=false;
                    foreach(string candidate in new[]{cwd,full,other}) {
                        if(EqualPath(entry,System.IO.Path.Combine(candidate,"scripts/run-framework.mjs")) || EqualPath(entry,System.IO.Path.Combine(candidate,"node_modules/vinext/dist/cli.js")))known=args.Length>2 && args[2]=="dev";
                        if(EqualPath(entry,System.IO.Path.Combine(candidate,"node_modules/vite/bin/vite.js")))known=args.Length==2 || args[2].StartsWith("--",StringComparison.Ordinal) || args[2]=="dev" || args[2]=="serve";
                    }
                    // Parse actual argv; text inside an arbitrary Node -e script isn't authority.
                    if(!known)return null;
                    return new HubSessionConflict {Pid=pid,StartedTicks=process.StartTime.ToUniversalTime().Ticks,directory=cwd,command=cmd};
                }
            } catch { return null; }
        }
        public void Stop(string executable,string root,int port,System.Threading.CancellationToken cancel) {
            cancel.ThrowIfCancellationRequested();
            var fresh=Find(executable,root,port);
            if(fresh==null || fresh.Pid!=Pid || fresh.StartedTicks!=StartedTicks || fresh.directory!=directory || fresh.command!=command)throw new InvalidOperationException("session-changed");
            using(var parent=System.Diagnostics.Process.GetProcessById(Pid)) {
                // Hold process handles before terminating: PID reuse cannot redirect Kill.
                IntPtr parentHandle=parent.Handle;
                if(parent.StartTime.ToUniversalTime().Ticks!=StartedTicks)throw new InvalidOperationException("session-changed");
                var children=new System.Collections.Generic.List<System.Diagnostics.Process>();
                try {
                    long capturedAt=DateTime.UtcNow.Ticks;
                    var descendants=Descendants(Pid);
                    foreach(int id in descendants) {
                        try {var child=System.Diagnostics.Process.GetProcessById(id);IntPtr childHandle=child.Handle;long started=child.StartTime.ToUniversalTime().Ticks;if(started>=StartedTicks && started<=capturedAt && SameUser(childHandle))children.Add(child);else {child.Dispose();throw new InvalidOperationException("process-unverified");}}catch(ArgumentException){}
                    }
                    cancel.ThrowIfCancellationRequested();
                    parent.Kill();
                    foreach(var child in children)if(!child.HasExited)child.Kill();
                    var clock=System.Diagnostics.Stopwatch.StartNew();
                    while(clock.Elapsed.TotalSeconds<15) {
                        cancel.ThrowIfCancellationRequested();
                        if(parent.HasExited && children.All(child=>child.HasExited) && !PortBusy(port))return;
                        System.Threading.Thread.Sleep(100);
                    }
                    throw new InvalidOperationException("session-stop-timeout");
                } finally {foreach(var child in children)child.Dispose();}
            }
        }
        static bool EqualPath(string a,string b){return String.Equals(System.IO.Path.GetFullPath(a).TrimEnd('\\'),System.IO.Path.GetFullPath(b).TrimEnd('\\'),StringComparison.OrdinalIgnoreCase);}
        static bool SameUser(IntPtr process) {
            IntPtr token;if(!OpenProcessToken(process,8,out token))return false;
            try {using(var identity=new System.Security.Principal.WindowsIdentity(token))using(var current=System.Security.Principal.WindowsIdentity.GetCurrent())return identity.User.Equals(current.User);}finally{CloseHandle(token);}
        }
        static string Parameter(IntPtr process,bool commandLine) {
            // Refuse cross-bitness inspection instead of interpreting the wrong PEB layout.
            bool targetWow,currentWow;
            if(!IsWow64Process(process,out targetWow)||!IsWow64Process(System.Diagnostics.Process.GetCurrentProcess().Handle,out currentWow)||targetWow!=currentWow)throw new InvalidOperationException("process-unverified");
            var info=new BASIC_INFORMATION();int returned;
            if(NtQueryInformationProcess(process,0,ref info,Marshal.SizeOf(info),out returned)!=0)throw new InvalidOperationException("process-unverified");
            IntPtr parameters=Pointer(Read(process,IntPtr.Add(info.Peb,IntPtr.Size==8?0x20:0x10),IntPtr.Size));
            byte[] text=Read(process,IntPtr.Add(parameters,commandLine?(IntPtr.Size==8?0x70:0x40):(IntPtr.Size==8?0x38:0x24)),IntPtr.Size==8?16:8);
            int length=BitConverter.ToUInt16(text,0);if(length>32766)throw new InvalidOperationException("process-unverified");
            IntPtr buffer=Pointer(text.Skip(IntPtr.Size==8?8:4).Take(IntPtr.Size).ToArray());
            return Encoding.Unicode.GetString(Read(process,buffer,length));
        }
        static IntPtr Pointer(byte[] bytes){return IntPtr.Size==8?new IntPtr(BitConverter.ToInt64(bytes,0)):new IntPtr(BitConverter.ToInt32(bytes,0));}
        static string[] Arguments(string command) {
            int count;IntPtr argv=CommandLineToArgvW(command,out count);if(argv==IntPtr.Zero)throw new InvalidOperationException("process-unverified");
            try {var args=new string[count];for(int i=0;i<count;i++)args[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(argv,i*IntPtr.Size));return args;}
            finally{LocalFree(argv);}
        }
        static byte[] Read(IntPtr process,IntPtr address,int count){var bytes=new byte[count];IntPtr read;if(!ReadProcessMemory(process,address,bytes,count,out read)||read.ToInt64()!=count)throw new InvalidOperationException("process-unverified");return bytes;}
        static System.Collections.Generic.List<int> Listeners(int port) {
            var ids=new System.Collections.Generic.HashSet<int>();
            foreach(int family in new[]{2,23}) {
                int size=0;GetExtendedTcpTable(IntPtr.Zero,ref size,false,family,3,0);IntPtr buffer=Marshal.AllocHGlobal(size);
                try {if(GetExtendedTcpTable(buffer,ref size,false,family,3,0)!=0)throw new InvalidOperationException("process-unverified");int count=Marshal.ReadInt32(buffer),rowSize=family==2?24:56,portOffset=family==2?8:20,pidOffset=family==2?20:52;
                    for(int i=0;i<count;i++){IntPtr row=IntPtr.Add(buffer,4+i*rowSize);int number=(Marshal.ReadByte(row,portOffset)<<8)|Marshal.ReadByte(row,portOffset+1);if(number==port)ids.Add(Marshal.ReadInt32(row,pidOffset));}
                }finally{Marshal.FreeHGlobal(buffer);}
            }
            return ids.ToList();
        }
        static System.Collections.Generic.List<int> Descendants(int pid) {
            var entries=new System.Collections.Generic.Dictionary<int,int>();var result=new System.Collections.Generic.List<int>();
            IntPtr snapshot=CreateToolhelp32Snapshot(2,0);if(snapshot==new IntPtr(-1))throw new InvalidOperationException("process-unverified");
            try {var entry=new PROCESS_ENTRY();entry.Size=(uint)Marshal.SizeOf(entry);if(Process32First(snapshot,ref entry))do{entries[(int)entry.Pid]=(int)entry.Parent;}while(Process32Next(snapshot,ref entry));}
            finally{CloseHandle(snapshot);}
            var parents=new System.Collections.Generic.HashSet<int>{pid};bool changed;
            do {changed=false;foreach(var entry in entries)if(parents.Contains(entry.Value)&&!parents.Contains(entry.Key)){parents.Add(entry.Key);result.Add(entry.Key);changed=true;}}while(changed);
            return result;
        }
        [StructLayout(LayoutKind.Sequential)] struct BASIC_INFORMATION {public IntPtr Reserved,Peb,Reserved2,Reserved3,Pid,Reserved4;}
        [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct PROCESS_ENTRY {public uint Size,Usage,Pid;public IntPtr Heap;public uint Module,Threads,Parent;public int Priority;public uint Flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string Exe;}
        [DllImport("ntdll.dll")]static extern int NtQueryInformationProcess(IntPtr process,int kind,ref BASIC_INFORMATION info,int size,out int returned);
        [DllImport("kernel32.dll")]static extern bool ReadProcessMemory(IntPtr process,IntPtr address,byte[] bytes,int count,out IntPtr read);
        [DllImport("kernel32.dll")]static extern bool IsWow64Process(IntPtr process,out bool wow);
        [DllImport("advapi32.dll")]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
        [DllImport("iphlpapi.dll")]static extern uint GetExtendedTcpTable(IntPtr buffer,ref int size,bool order,int family,int table,uint reserved);
        [DllImport("kernel32.dll")]static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool Process32First(IntPtr snapshot,ref PROCESS_ENTRY entry);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool Process32Next(IntPtr snapshot,ref PROCESS_ENTRY entry);
        [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
        [DllImport("shell32.dll",CharSet=CharSet.Unicode)]static extern IntPtr CommandLineToArgvW(string command,out int count);
        [DllImport("kernel32.dll")]static extern IntPtr LocalFree(IntPtr memory);
    }
    // A kernel job handle, rather than a PID search, is the authority to stop a tree.
    public sealed class ProcessHost : IDisposable {
        IntPtr job, process;
        public int Pid { get; private set; }
        public DateTime StartedAt { get; private set; }
        public event Action<string> Output;
        public bool HasExited { get { return process == IntPtr.Zero || WaitForSingleObject(process, 0) == 0; } }
        public bool IsTreeEmpty { get { if(job==IntPtr.Zero)return true;JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info;Check(QueryInformationJobObject(job,1,out info,(uint)Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)),IntPtr.Zero));return info.ActiveProcesses==0; } }
        public int ExitCode { get { uint code; if (process == IntPtr.Zero || !GetExitCodeProcess(process, out code)) return -1; return unchecked((int)code); } }

        public static string Quote(string value) {
            if (value == null) value = "";
            var b = new StringBuilder("\""); int slashes = 0;
            foreach (char c in value) {
                if (c == '\\') { slashes++; continue; }
                if (c == '"') { b.Append('\\', slashes * 2 + 1); b.Append(c); slashes = 0; continue; }
                b.Append('\\', slashes); slashes = 0; b.Append(c);
            }
            b.Append('\\', slashes * 2); return b.Append('"').ToString();
        }

        public void Start(string executable, string[] arguments, string directory, IDictionary<string,string> environment) {
            if (job != IntPtr.Zero) throw new InvalidOperationException("Already started");
            IntPtr read = IntPtr.Zero, write = IntPtr.Zero, inputRead = IntPtr.Zero, inputWrite = IntPtr.Zero, env = IntPtr.Zero;
            PROCESS_INFORMATION pi = new PROCESS_INFORMATION();
            try {
                job = CreateJobObject(IntPtr.Zero, null); Check(job != IntPtr.Zero);
                var limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                limits.BasicLimitInformation.LimitFlags = 0x2000; // KILL_ON_JOB_CLOSE
                Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)));
                var sa = new SECURITY_ATTRIBUTES { nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)), bInheritHandle = true };
                Check(CreatePipe(out read, out write, ref sa, 0));
                Check(SetHandleInformation(read, 1, 0));
                Check(CreatePipe(out inputRead, out inputWrite, ref sa, 0));
                Check(SetHandleInformation(inputWrite, 1, 0));
                var si = new STARTUPINFO { cb = Marshal.SizeOf(typeof(STARTUPINFO)), dwFlags = 0x101, wShowWindow = 0, hStdOutput = write, hStdError = write, hStdInput = inputRead };
                var variables = new SortedDictionary<string,string>(StringComparer.OrdinalIgnoreCase);
                foreach (DictionaryEntry pair in Environment.GetEnvironmentVariables()) variables[(string)pair.Key] = (string)pair.Value;
                foreach (var pair in environment) variables[pair.Key] = pair.Value;
                var block = new StringBuilder(); foreach (var pair in variables) block.Append(pair.Key).Append('=').Append(pair.Value).Append('\0'); block.Append('\0');
                env = Marshal.StringToHGlobalUni(block.ToString());
                var command = new StringBuilder(Quote(executable)); foreach (string arg in arguments) command.Append(' ').Append(Quote(arg));
                // Serialize launch to prevent inheritable pipe handles crossing simultaneous starts.
                Check(CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, true, 0x08000000 | 0x00000004 | 0x00000400, env, directory, ref si, out pi));
                process = pi.hProcess; Pid = (int)pi.dwProcessId; StartedAt = DateTime.UtcNow;
                if (!AssignProcessToJobObject(job, process)) { int error = Marshal.GetLastWin32Error(); TerminateProcess(process, 1); throw new Win32Exception(error); }
                Check(ResumeThread(pi.hThread) != 0xffffffff);
                CloseHandle(write); write = IntPtr.Zero; CloseHandle(inputRead); inputRead = IntPtr.Zero; CloseHandle(inputWrite); inputWrite = IntPtr.Zero;
                var stream = new FileStream(new SafeFileHandle(read, true), FileAccess.Read, 4096, false); read = IntPtr.Zero;
                var thread = new Thread(() => Drain(stream)); thread.IsBackground = true; thread.Start();
            } catch { if (process != IntPtr.Zero && !HasExited) TerminateProcess(process, 1); Dispose(); throw; }
            finally { if (pi.hThread != IntPtr.Zero) CloseHandle(pi.hThread); if (read != IntPtr.Zero) CloseHandle(read); if (write != IntPtr.Zero) CloseHandle(write); if (inputRead != IntPtr.Zero) CloseHandle(inputRead); if (inputWrite != IntPtr.Zero) CloseHandle(inputWrite); if (env != IntPtr.Zero) Marshal.FreeHGlobal(env); }
        }
        void Drain(Stream stream) {
            // Never retain arbitrary stdout or unbounded lines; only consumers' allowlisted markers survive.
            try { using (stream) using (var reader = new StreamReader(stream)) { var line = new StringBuilder(); int next; while ((next = reader.Read()) >= 0) { if (next == '\n') { var handler = Output; if (handler != null) handler(line.ToString().TrimEnd('\r')); line.Length = 0; } else if (line.Length < 4096) line.Append((char)next); } } } catch (IOException) { } catch (ObjectDisposedException) { }
        }
        public void Stop() { if (job != IntPtr.Zero) Check(TerminateJobObject(job, 0)); }
        public void Dispose() { if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; } if (process != IntPtr.Zero) { CloseHandle(process); process = IntPtr.Zero; } }
        static void Check(bool success) { if (!success) throw new Win32Exception(Marshal.GetLastWin32Error()); }
        [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION {public long TotalUserTime,TotalKernelTime,ThisPeriodTotalUserTime,ThisPeriodTotalKernelTime;public uint TotalPageFaultCount,TotalProcesses,ActiveProcesses,TotalTerminatedProcesses;}
        [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int infoClass,out JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info,uint length,IntPtr returned);
        [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES { public int nLength; public IntPtr lpSecurityDescriptor; [MarshalAs(UnmanagedType.Bool)] public bool bInheritHandle; }
        [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO { public int cb; public string lpReserved, lpDesktop, lpTitle; public uint dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags; public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
        [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public uint dwProcessId, dwThreadId; }
        [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_BASIC_LIMIT_INFORMATION { public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
        [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
        [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION { public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation; public IO_COUNTERS IoInfo; public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }
        [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, uint length);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint exitCode);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint exitCode);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref SECURITY_ATTRIBUTES attributes, uint size);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
        [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcess(string app, StringBuilder command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFO startup, out PROCESS_INFORMATION process);
        [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint timeout);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    }
}
