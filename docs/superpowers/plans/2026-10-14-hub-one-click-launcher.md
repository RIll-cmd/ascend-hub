# One-click Hub Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One double-click on **Ascend Hub** starts Hub in production mode, opens it in an Edge app window, and leaves a compact launcher that hides to the tray.

**Architecture:** The existing C# supervisor (`desktop/Supervisor.cs`, `ProcessHost.cs`) gains a `production` runtime that runs `scripts/run-framework.mjs serve`. The PowerShell/WPF launcher (`Start-Ascend.ps1`, `LauncherPresentation.ps1`, `HubLauncher.xaml`) gets:
- a compact Hub window;
- pure helpers for copy, agent count and Edge lookup;
- auto-open on the first ready state;
- a WinForms `NotifyIcon` tray.

Vision code paths stay as they are.

**Tech Stack:** Windows PowerShell 5.1, WPF XAML, C# compiled by `Add-Type`, System.Windows.Forms `NotifyIcon`, UI Automation for the native test.

**Spec:** `docs/superpowers/specs/2026-10-14-hub-one-click-launcher-design.md`

## Global Constraints

- Commits carry no Claude co-author or attribution lines (owner rule).
- Run desktop tests with `powershell.exe` (5.1), never `pwsh`.
- Vision behaviour and Vision test assertions stay unchanged.
- `-FixtureMode` must never open Edge or a browser, and never show tray balloons.
- URL launches only go to `http://127.0.0.1:<port>/` with no user info, as today.
- Do not change the owner's real profile or shortcut without asking. The reinstall is a separate, confirmed step.
- Baseline: `Test-Supervisor.ps1` already fails ("port already in use" in its restart cycle) before any change. New runtime checks live in a new `tests/Test-HubRuntime.ps1`, so they can't be hidden by that failure.

## Review Focus

1. A second launch while Hub is `ready` must open the app window without starting a second Hub. While Hub is starting, it must only show the launcher.
2. Closing the window while Hub starts or runs hides it to the tray and keeps the owned process alive. Closing it while stopped or failed exits.
3. **Quit** must stop Hub (and with it the room process in the job object) before the launcher exits, including when the stop needs Force.
4. Missing Edge falls back to the default browser. A missing or odd App Paths value must not throw.
5. Agent-room polling must never block the UI thread or throw when Hub is down. A non-JSON or 403 reply shows "Offline".

---

### Task 1: Production runtime in the supervisor

**Files:** Modify `desktop/Supervisor.cs` (Validate, Arguments made public, stage parsing) and `desktop/ProcessHost.cs` (extract `KnownEntry`, accept `serve`/`start`). Create `desktop/tests/Test-HubRuntime.ps1`.

**Interfaces:**
- Produces:
  - `public static string[] Supervisor.Arguments(ComponentProfile p, string component, bool recovery, bool fixtures)`;
  - `public static bool HubSessionConflict.KnownEntry(string entry, string[] args, string[] roots)`.

- [ ] **Step 1: Write the failing test** `desktop/tests/Test-HubRuntime.ps1`

```powershell
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
  $args=[Ascend.Desktop.Supervisor]::Arguments($p,'hub',$false,$false)
  Assert (($args -join ' ') -eq 'scripts/run-framework.mjs serve --port 5199') "production arguments (got $($args -join ' '))"
  $p.runtime='development'
  Assert ((([Ascend.Desktop.Supervisor]::Arguments($p,'hub',$false,$false)) -join ' ') -like 'node_modules/vinext/dist/cli.js dev*') 'development unchanged'
  $roots=@($root)
  $rf=Join-Path $root 'scripts/run-framework.mjs';$cli=Join-Path $root 'node_modules/vinext/dist/cli.js'
  Assert ([Ascend.Desktop.HubSessionConflict]::KnownEntry($rf,@('node',$rf,'serve'),$roots)) 'serve session is a known Hub session'
  Assert ([Ascend.Desktop.HubSessionConflict]::KnownEntry($rf,@('node',$rf,'dev'),$roots)) 'dev session still known'
  Assert ([Ascend.Desktop.HubSessionConflict]::KnownEntry($cli,@('node',$cli,'start'),$roots)) 'vinext start is known'
  Assert (-not [Ascend.Desktop.HubSessionConflict]::KnownEntry($rf,@('node',$rf,'build'),$roots)) 'a build is not a session'
  Assert (-not [Ascend.Desktop.HubSessionConflict]::KnownEntry((Join-Path $env:TEMP 'other.js'),@('node','x','serve'),$roots)) 'other scripts are not sessions'
  'hub runtime checks passed'
} finally { Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue }
```

- [ ] **Step 2: Run** `powershell.exe -NoProfile -ExecutionPolicy Bypass -File desktop\tests\Test-HubRuntime.ps1`. Expected: FAIL. `Arguments` is inaccessible, or there's a `runtime-profile` error.

- [ ] **Step 3: Implement**

In `Supervisor.cs`, `Validate` for hub:

```csharp
if(p.runtime!="development" && p.runtime!="portable" && p.runtime!="production") throw new InvalidOperationException("runtime-profile");
string artifact=p.runtime=="portable"?"dist/server/wrangler.json":p.runtime=="production"?"scripts/run-framework.mjs":"node_modules/vinext/dist/cli.js";
```

`static string[] Arguments(` becomes `public static string[] Arguments(`, with this added before the development line:

```csharp
if(p.runtime=="production") return new [] {"scripts/run-framework.mjs","serve","--port",Port(p).ToString()};
```

Add stage lines in the `child.Output` handler, after the "Starting local server" branch:

```csharp
} else if(name=="hub" && (line.Contains("building") || line.Contains("Building") || line.Contains("transforming"))) {
    Update(slot,generation,"starting","Building Hub (first start after an update)","");
} else if(name=="hub" && line.Contains("Production server running")) {
    Update(slot,generation,"starting","Starting Hub","");
```

In `ProcessHost.cs`, replace the inline `known` loop with a call to the new method:

```csharp
public static bool KnownEntry(string entry,string[] args,string[] roots) {
    bool known=false;
    foreach(string candidate in roots) {
        if(EqualPath(entry,System.IO.Path.Combine(candidate,"scripts/run-framework.mjs"))) known=args.Length>2 && (args[2]=="dev" || args[2]=="serve");
        if(EqualPath(entry,System.IO.Path.Combine(candidate,"node_modules/vinext/dist/cli.js"))) known=args.Length>2 && (args[2]=="dev" || args[2]=="start");
        if(EqualPath(entry,System.IO.Path.Combine(candidate,"node_modules/vite/bin/vite.js"))) known=args.Length==2 || args[2].StartsWith("--",StringComparison.Ordinal) || args[2]=="dev" || args[2]=="serve";
    }
    return known;
}
```

At the call site: `bool known=KnownEntry(entry,args,new[]{cwd,full,other});`. `EqualPath` must be static and accessible from it; check this when you edit.

- [ ] **Step 4: Run** Test-HubRuntime, then `Test-SessionReplacement.ps1`. Expected: both PASS.
- [ ] **Step 5: Commit**

```bash
git add desktop/Supervisor.cs desktop/ProcessHost.cs desktop/tests/Test-HubRuntime.ps1
git commit -m "feat(desktop): production Hub runtime runs serve and is a verified session"
```

---

### Task 2: Pure launcher helpers

**Files:** Modify `desktop/LauncherPresentation.ps1` and `desktop/tests/Test-HubRuntime.ps1` (dot-source and assert).

**Interfaces:**
- Produces:
  - `Get-HubFailureText([string]$code) -> string`;
  - `Get-AgentSummary($room) -> string`, where `$room` is the parsed `/api/room` object or `$null`;
  - `Resolve-EdgePath([string[]]$candidates) -> string|$null`, returning the first candidate that is a rooted existing file ending in `msedge.exe`.

- [ ] **Step 1: Write the failing test** (append to Test-HubRuntime.ps1 before the final message line)

```powershell
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
Assert ((Resolve-EdgePath @($null,'',"relative\msedge.exe",(Join-Path $root 'nope\msedge.exe'),$edge)) -eq $edge) 'first existing rooted msedge'
Assert ($null -eq (Resolve-EdgePath @((Join-Path $env:WINDIR 'System32\cmd.exe')))) 'only msedge.exe accepted'
```

(Move the `finally` cleanup so `$root` still exists here: these lines go inside the `try`.)

- [ ] **Step 2: Run** Test-HubRuntime. Expected: FAIL. `Get-HubFailureText` is not recognized.

- [ ] **Step 3: Implement** in `LauncherPresentation.ps1`

```powershell
function Get-HubFailureText([string]$code) {
    switch -Wildcard ($code) {
        'profile-missing' { "Hub isn't set up yet."; break }
        'port-in-use' { 'Another copy of Hub is using port 5173.'; break }
        'runtime-missing' { "Node.js wasn't found."; break }
        'hub-build-missing' { "Hub's files are missing."; break }
        'startup-timeout' { 'Hub took too long to start.'; break }
        'child-exit-*' { 'Hub stopped unexpectedly.'; break }
        default { "Hub couldn't start." }
    }
}
function Get-AgentSummary($room) {
    if ($null -eq $room -or -not $room.online -or $null -eq $room.agents) { return 'Offline' }
    $states = @($room.agents.PSObject.Properties | ForEach-Object { [string]$_.Value.state })
    if ($states.Count -eq 0) { return 'Offline' }
    if (@($states | Where-Object { $_ -ne 'checking' }).Count -eq 0) { return 'Starting' }
    $up = @($states | Where-Object { $_ -notin @('offline','checking') }).Count
    "$up of $($states.Count) agents"
}
function Resolve-EdgePath([string[]]$candidates) {
    foreach ($candidate in $candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        $path = $candidate.Trim('"')
        if ([IO.Path]::IsPathRooted($path) -and [IO.Path]::GetFileName($path) -ieq 'msedge.exe' -and (Test-Path -LiteralPath $path -PathType Leaf)) { return $path }
    }
    $null
}
```

- [ ] **Step 4: Run** Test-HubRuntime. Expected: PASS.
- [ ] **Step 5: Commit** `git add desktop/LauncherPresentation.ps1 desktop/tests/Test-HubRuntime.ps1 && git commit -m "feat(desktop): plain failure text, agent summary and Edge lookup helpers"`

---

### Task 3: Compact Hub window

**Files:** Replace `desktop/HubLauncher.xaml`. Modify `desktop/LauncherPresentation.ps1` (add `Set-HubSnapshot`; `Set-LauncherSnapshot` delegates for Hub) and `desktop/tests/Test-LauncherLayout.ps1` (Hub assertions).

**Interfaces:**
- Consumes: Task 2 helpers.
- Produces: `Set-HubSnapshot($window, $snapshot, [string]$agents)`. Named controls kept for scripts and tests: `Composition, State, Stage, Timing, Primary, Cancel, Stop, Force, ReplaceSession, Details, Failure, Diagnostics, ProfileStatus, CloseActions, CloseCancel, CloseStop, UiStatus, CoreStatus`. New: `AgentStatus, Progress, StatusLines`.

- [ ] **Step 1: Write the failing layout assertions.** In `Test-LauncherLayout.ps1`, replace the Hub-only assertions (the landscape `Monitor` check and the `HubArtwork` 500×500 check may stay, because the artwork is reused as the small TV icon) with:

```powershell
Assert ($window.Width -le 360) 'Hub launcher is compact'
```

Inside the per-state loop, for Hub:

```powershell
if($product -eq 'Hub'){
  $heading=$window.FindName('State').Text
  $expected=@{stopped='Hub is stopped';checking='Waking up Hub';starting='Waking up Hub';ready='Hub is open';degraded='Hub is open, with limits';stopping='Stopping Hub';stop_failed="Hub didn't stop"}
  if($expected.ContainsKey($state)){Assert ($heading -eq $expected[$state]) "Hub heading for $state (got $heading)"}
  Assert (($window.FindName('Progress').Visibility -eq 'Visible') -eq ($state -in @('checking','starting'))) "Hub progress only while starting ($state)"
  Assert (($window.FindName('StatusLines').Visibility -eq 'Visible') -eq ($state -in @('ready','degraded'))) "Hub status lines only when open ($state)"
  Assert ($window.FindName('Timing').Text -notmatch 'Stage') 'no stage counters in Hub copy'
  if($state -eq 'profile-missing'){Assert ($heading -eq "Hub isn't set up yet.") 'setup failure sentence'}
}
```

Use the test window width `$width` from 300 to 360 for Hub: change `foreach($width in @(420,520))` to `foreach($width in $(if($product -eq 'Hub'){@(300,360)}else{@(420,520)}))`, and set the Hub height to 420 in place of 660.

- [ ] **Step 2: Run** `powershell.exe -File desktop\tests\Test-LauncherLayout.ps1 -AuditDirectory <scratch>`. Expected: FAIL on "Hub launcher is compact".

- [ ] **Step 3: Write the new `HubLauncher.xaml`.** It's a 320×400 window (MinWidth 300, MinHeight 360) with the same brush keys as today. Layout:
  - a header row: 56 px TV image (`{DynamicResource HubArtwork}`), a mono kicker `Kicker`, and the heading `State` (17 pt SemiBold, wraps);
  - `Stage` as one plain line (secondary);
  - `Progress`, an indeterminate `ProgressBar` (height 6, accent);
  - a `StatusLines` panel with three rows: Hub/`UiStatus`, Agent room/`AgentStatus`, Core status/`CoreStatus`, each with a coloured `Ellipse` dot named `UiDot`/`AgentDot`/`CoreDot`;
  - an action row with `Primary` (accent style, stretches), then `Stop`, `Cancel`, `Force` and `ReplaceSession`;
  - the `Details` expander (collapsed), holding `Timing`, `Failure`, `Diagnostics` and `ProfileStatus`;
  - `CloseActions`, `CloseCancel` and `CloseStop` kept but always `Collapsed` (Vision still uses its own).
  - Everything sits inside `ScrollViewer` > `StackPanel x:Name="Composition"`. Keep `x:Name="Monitor"` on the header border so the existing artwork assertion still finds it.

- [ ] **Step 4: Implement `Set-HubSnapshot`** in LauncherPresentation.ps1, and make `Set-LauncherSnapshot` start with `if ($product -eq 'Hub') { Set-HubSnapshot $window $snapshot $script:HubAgentSummary; return }`.

```powershell
$script:HubAgentSummary = 'Offline'
function Set-HubSnapshot($window, $snapshot, [string]$agents) {
    $state = $snapshot.State
    $failedText = if ($state -eq 'failed') { Get-HubFailureText $snapshot.FailureCode } else { '' }
    $heading = switch ($state) {
        'stopped' { 'Hub is stopped' } 'checking' { 'Waking up Hub' } 'starting' { 'Waking up Hub' }
        'ready' { 'Hub is open' } 'degraded' { 'Hub is open, with limits' } 'failed' { $failedText }
        'stopping' { 'Stopping Hub' } 'stop_failed' { "Hub didn't stop" } default { 'Hub is stopped' }
    }
    $kicker = switch ($state) { {$_ -in 'checking','starting'} { 'STARTING' } {$_ -in 'ready','degraded'} { 'RUNNING' } 'failed' { 'NEEDS ATTENTION' } default { 'ASCEND HUB' } }
    $window.FindName('State').Text = $heading
    $window.FindName('Kicker').Text = $kicker
    $open = $state -in @('ready','degraded') -and -not [string]::IsNullOrWhiteSpace($snapshot.Url)
    $starting = $state -in @('checking','starting')
    $window.FindName('Stage').Text = if ($starting) { $snapshot.Stage } elseif ($state -eq 'failed' -and $snapshot.FailureCode -eq 'port-in-use') { 'Stop the other copy, then Hub starts here.' } else { '' }
    $window.FindName('Progress').Visibility = if ($starting) { 'Visible' } else { 'Collapsed' }
    $window.FindName('StatusLines').Visibility = if ($state -in @('ready','degraded')) { 'Visible' } else { 'Collapsed' }
    $window.FindName('UiStatus').Text = if ($snapshot.Ui -eq 'ready') { 'Running' } else { Get-CapabilityLabel $snapshot.Ui }
    $window.FindName('AgentStatus').Text = $agents
    $window.FindName('CoreStatus').Text = Get-CapabilityLabel $snapshot.Core
    $primary = $window.FindName('Primary')
    $primary.Content = if ($open) { '_Open Hub' } elseif ($starting) { 'Starting...' } elseif ($state -eq 'failed') { '_Retry' } elseif ($state -in @('stopping','stop_failed')) { 'Stopping...' } else { '_Start Hub' }
    $primary.IsEnabled = $open -or $state -in @('stopped','failed')
    [Windows.Automation.AutomationProperties]::SetName($primary, ($primary.Content -replace '_',''))
    foreach ($spec in @(@('Cancel',$starting), @('Stop',($state -in @('ready','degraded'))), @('Force',($state -in @('stopping','stop_failed'))))) {
        $b=$window.FindName($spec[0]); $b.Visibility=if($spec[1]){'Visible'}else{'Collapsed'}; $b.IsEnabled=[bool]$spec[1]
    }
    $replacement=$window.FindName('ReplaceSession')
    $show=$state -eq 'failed' -and $snapshot.FailureCode -eq 'port-in-use'
    $replacement.Visibility=if($show){'Visible'}else{'Collapsed'}
    $replacement.IsEnabled=$show -and [bool]$snapshot.CanReplaceSession
    $replacement.ToolTip=if($snapshot.CanReplaceSession){"Stop the other Hub (PID $($snapshot.ConflictPid)) and start here"}else{"That copy couldn't be verified as yours. Close it yourself, then press Retry."}
    $seconds=[math]::Floor($snapshot.ElapsedSeconds)
    $window.FindName('Timing').Text = if ($state -in @('ready','degraded')) { "Started in $([math]::Floor($snapshot.StartupSeconds))s, running for ${seconds}s" } elseif ($starting) { "Starting for ${seconds}s" } else { '' }
    $window.FindName('Failure').Text = if ($snapshot.FailureCode) { "Code: $($snapshot.FailureCode). Step: $($snapshot.FailureStage). $($snapshot.Stage)" } else { 'Startup details appear here if something goes wrong.' }
}
```

The `ReplaceSession` button text becomes "Stop the other copy and retry".

- [ ] **Step 5: Run** Test-LauncherLayout. Expected: PASS. View `hub-*-100.png` and `hub-*-200.png` for clipping.
- [ ] **Step 6: Commit** `git add desktop/HubLauncher.xaml desktop/LauncherPresentation.ps1 desktop/tests/Test-LauncherLayout.ps1 && git commit -m "feat(desktop): compact Hub launcher window with plain status lines"`

---

### Task 4: One-click flow, app window and tray

**Files:** Modify `desktop/Start-Ascend.ps1` and `desktop/tests/Test-NativeLaunchers.ps1`.

**Interfaces:**
- Consumes: `Resolve-EdgePath`, `Get-AgentSummary`, `$script:HubAgentSummary`, `Set-LauncherSnapshot`.

- [ ] **Step 1: Write the failing native assertions.** In `Test-NativeLaunchers.ps1`, replace the Hub close-prompt block (`$hubPattern.Close(); Assert-ClosePrompt ...; CloseStop`) with:

```powershell
$hubPattern.Close()
[void](Wait-For {$h=Get-Window $hub.Id; if($null -eq $h -or $h.Current.IsOffscreen){$true}} 'closing Hub hides it to the tray')
Assert (-not $hub.HasExited) 'Hub keeps running in the tray'
$again=Start-Process -FilePath (Join-Path $scratch 'Hub.lnk') -PassThru -WindowStyle Hidden
[void](Wait-For {$again.Refresh();$again.HasExited} 'second Hub shortcut exits after activating')
$hubWindow=Wait-For {$h=Get-Window $hub.Id; if($null -ne $h -and -not $h.Current.IsOffscreen){$h}} 'second shortcut shows the launcher in fixture mode'
Invoke-Control $hubWindow 'Stop'
[void](Wait-For {if((Find-Control $hubWindow 'Primary').Current.Name -eq 'Start Hub'){$true}} 'Hub stopped')
$hubWindow.GetCurrentPattern([Windows.Automation.WindowPattern]::Pattern).Close()
```

Keep the following lines (`'closing Hub preserves Vision'`, Hub exits, Vision close prompt) as they are.

- [ ] **Step 2: Run** `powershell.exe -File desktop\tests\Test-NativeLaunchers.ps1`. Expected: FAIL at "closing Hub hides it to the tray", because the close prompt appears instead.

- [ ] **Step 3: Implement in `Start-Ascend.ps1`.** All of these blocks are guarded by `$product -eq 'Hub'`; Vision paths stay unchanged.

1. `Add-Type -AssemblyName System.Windows.Forms, System.Drawing` (Hub only).
2. `Open-HubWindow`:
   - It validates the URL as today.
   - In `-FixtureMode` it shows the launcher window and returns, without opening Edge.
   - Otherwise it builds the candidates from these sources, in order:
     - `(Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe' -EA SilentlyContinue).'(default)'`;
     - the same key under HKLM;
     - `"${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"`;
     - `"$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"`.
   - It calls `Resolve-EdgePath`. If that returns a path, it starts it with `--app=<url>`. Otherwise it falls back to `UseShellExecute` on the URL.
   - On a failure it sets `ProfileStatus` to "Couldn't open the browser. Press Open Hub to try again."
   - **Primary** in the ready state and the tray's Open Hub call it.
3. Auto-open: `$script:autoOpened=$false`. In the 250 ms tick, when the Hub snapshot first reaches `ready` or `degraded` with a URL and `-not $script:autoOpened`, it sets the flag and calls `Open-HubWindow`. A later restart in the same launcher (Retry/Start) resets the flag, so the next ready opens again.
4. Second shortcut: in the tick, `ActivationPending()` makes Hub call `Open-HubWindow` when the state is `ready`/`degraded` and not fixture mode. Otherwise it shows and activates the window, as today.
5. Agent poll: a `System.Net.WebClient` with `DownloadStringAsync` against `<url>api/room`, run every 5 s from the tick while ready or degraded.
   - `DownloadStringCompleted` parses with `ConvertFrom-Json` inside try/catch and sets `$script:HubAgentSummary = Get-AgentSummary $parsed`.
   - On any error it's `'Offline'`.
   - Never start a poll while one is still running.
6. Tray: a `NotifyIcon` with the icon from `assets\hub.ico` and the text `"Ascend Hub - $($window.FindName('State').Text)"`, trimmed to 63 characters and updated in the tick.
   - Its `ContextMenuStrip` holds Open Hub, Show launcher, Stop Hub and Quit. Double-click opens Hub when it's running and shows the launcher otherwise.
   - Quit sets `$script:quitting=$true`, calls `$supervisor.Stop('hub')`, then shows the window so Force stays reachable. The tick closes the window when the state is `stopped` or `failed` and `$script:quitting`.
   - The icon is disposed in `Add_Closed`.
7. Closing: for Hub, `Add_Closing` hides instead of prompting when the state is not `stopped`/`failed`, or when `Owned` is set, unless `$script:quitting`.
   - It sets `$_.Cancel=$true`, then `$window.Hide()`.
   - The first time, and not in fixture mode, it shows the balloon "Ascend Hub keeps running here. Right-click to stop it."
   - When Hub is stopped or failed, the window closes normally and the launcher exits.
   - Vision keeps the `CloseActions` prompt.
8. The window's `ShowDialog()` stays. A hidden window keeps the dispatcher running, so the tray stays alive.

- [ ] **Step 4: Run** `Test-NativeLaunchers.ps1`, `Test-SessionReplacement.ps1` and `Test-LauncherLayout.ps1`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add desktop/Start-Ascend.ps1 desktop/tests/Test-NativeLaunchers.ps1 && git commit -m "feat(desktop): Hub opens in an app window by itself and keeps running in the tray"`

---

### Task 5: Installer defaults to production

**Files:** Modify `desktop/Install-Ascend.ps1`, `desktop/tests/Test-Installer.ps1` and `desktop/README.md`.

- [ ] **Step 1: Write the failing test.** After the existing install call in `Test-Installer.ps1`, add:

```powershell
$installed = Get-Content -Raw (Join-Path $destination 'profile.json') | ConvertFrom-Json
Assert ($installed.hub.runtime -eq 'production') 'Hub defaults to the production runtime'
```

Also create `scripts\run-framework.mjs` in the fake hub root (the installer will require it). Add a second install with `-Force -HubRuntime development -SkipShortcuts` that asserts `runtime -eq 'development'`.

- [ ] **Step 2: Run** `Test-Installer.ps1`. Expected: FAIL. The runtime is `development`.
- [ ] **Step 3: Implement.**
  - Add the param `[ValidateSet('development','production')][string]$HubRuntime = 'production'`.
  - Require `scripts\run-framework.mjs` when production and `node_modules\vinext\dist\cli.js` in both cases (`serve` uses it).
  - The profile gets `runtime = $HubRuntime`.
  - In the README, the runtime paragraph says Hub uses the production `serve` runtime: about 2 s after the first build, 127.0.0.1 only, with the dev runtime still selectable through `-HubRuntime development`. It also describes the tray and app-window flow in three short sentences.
- [ ] **Step 4: Run** `Test-Installer.ps1`. Expected: PASS.
- [ ] **Step 5: Commit** `git add desktop/Install-Ascend.ps1 desktop/tests/Test-Installer.ps1 desktop/README.md && git commit -m "feat(desktop): installer defaults Hub to the production runtime"`

---

### Task 6: Live check and handoff

- [ ] **Step 1:** Install into a scratch profile: `Install-Ascend.ps1 -HubRoot D:\ascend_hub -VisionRoot D:\ascend-vision\ascend-vision -DestinationRoot <scratch> -SkipShortcuts`. Use the real Node and Python paths from the current profile.
- [ ] **Step 2:** Make sure nothing listens on 5173; stopping anything there needs the owner's OK. Then run `Start-Ascend.ps1 -Target Hub -ProfilePath <scratch>\profile.json`.
  - Confirm the launcher reaches "Hub is open".
  - Confirm an Edge app window opens at `http://127.0.0.1:5173/` and the agent room line fills in.
  - Close the launcher and confirm the process is still alive and the tray icon is present.
  - Quit through the supervisor (or Stop, then close), and confirm no `run-framework`, `vinext` or room process remains.
- [ ] **Step 3:** Run all desktop tests, Hub web tests and `tsc`. Update `ASCEND_HANDOFF.md`, and leave it uncommitted.
- [ ] **Step 4:** Ask the owner before re-running the installer with `-Force` against the real profile and shortcut.
