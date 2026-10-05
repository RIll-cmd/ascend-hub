using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace Ascend.Desktop {
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
