# Ascend Desktop launcher (Windows)

The two native Windows launchers share one supervisor engine. **Ascend Vision** opens an indigo Fairy eye window; **Ascend Hub** opens a charcoal operations console. Each shortcut starts only its product, and both windows can run simultaneously. Each has Start -> Starting -> Open, Cancel during startup, Stop, Force stop after a shutdown request, Retry after failure, and expandable diagnostics. Startup work runs off the UI thread.

Full Vision is the default. **Chat recovery** starts a separate Fairy chat host with no camera, microphone, speech, gestures, focus sessions, or browser automation. Use it if full Vision fails or reaches its startup deadline. Stop full Vision before starting recovery so two processes do not own one chat session. The launcher enforces this per component.

## Setup

This version runs from selected local checkouts and installed Node/Python environments. It does not install packages, download models, or build frontend assets on each launch. Requirements:

- Windows PowerShell 5.1 and the .NET Framework desktop libraries included with Windows.
- Node.js 22.13 or newer, installed Hub `node_modules`, and the Hub checkout.
- Python 3.11 or newer with Vision's existing dependencies, Vision `config.yaml`, owner-managed `.env`, and built `fairy-ui/dist/index.html`.
- The local `desktop_host.py` recovery entrypoint in the selected Vision checkout.

From a Windows PowerShell terminal, after checking the paths:

```powershell
& 'D:\ascend_hub\desktop\Install-Ascend.ps1' `
  -HubRoot 'D:\ascend_hub' `
  -VisionRoot 'D:\ascend-vision\ascend-vision' `
  -NodeExe 'D:\node.exe' `
  -PythonExe 'D:\ascend-vision\ascend-vision\.venv\Scripts\python.exe' `
  -VisionConfig 'D:\ascend-vision\ascend-vision\config.yaml' `
  -VisionEnvFile 'D:\ascend-vision\ascend-vision\.env'
```

Installation saves only local paths and runtime choices in `%LOCALAPPDATA%\Ascend\Desktop\profile.json`; credentials remain in the existing env file. `-VisionConfig` is optional and defaults to the selected Vision checkout. Use it when testing a code worktree against your existing Vision configuration and data; relative data/model paths resolve from the config file's directory. It creates **Ascend Vision** and **Ascend Hub** shortcuts on the current user's desktop. Each shortcut passes the installed profile path explicitly. If a profile already exists, the installer refuses to replace it unless you explicitly add `-Force`; a forced replacement keeps a dated backup, including when Windows encryption disallows atomic file replacement. The shortcuts point to the checkout where the installer script lives. If installed from a worktree, preserve that worktree until you reinstall from a stable checkout after integration.

If Windows encryption makes a profile under LocalAppData unreadable to a desktop-launched process, install with `-DestinationRoot (Join-Path $env:USERPROFILE '.ascend\desktop')`. Check that the new folder is not encrypted before relying on it. The shortcut will use the new absolute path; leave the old profile in place for rollback. The profile holds local paths, not API keys.

You may open the controls without starting either app:

```powershell
& 'D:\ascend_hub\desktop\Start-Ascend.ps1' # Vision controls, without autostart
# To select Hub and start it, pass -Target Hub and your existing -ProfilePath.
```

The app starts Hub on the local profile's port (5173 by default) and Vision on its own ephemeral loopback port. After authenticated health responds, **Open** becomes available for the verified loopback URL. Chat, camera, microphone and Core labels come from that health contract; absent/unknown fields say **Not checked**. Hub interface availability is distinct from Core/status-feed availability. No camera, model or AI request is made to draw the launcher artwork.

A per-Windows-owner/per-product mutex prevents duplicate process trees; a second shortcut click restores the existing product window. Distinct eye/CRT icons and AppUserModelIDs identify the products in native windows and the taskbar. If the old combined launcher is running, close it before starting a new product owner. Closing one launcher offers **Cancel closing** or **Stop this app and close**. The window remains responsive and closes only after its own owned tree is verified empty. It never stops the other product.

## Current release limits

- Hub uses its local Vinext development runtime. The built Wrangler runtime cannot start with the current media library: multiple videos exceed its 25 MiB asset limit. The launcher keeps that portable profile unverified. This means the first Hub start may spend time optimizing dependencies; progress and Cancel remain available.
- Full Vision still performs native model/camera initialization in its main process. The launcher reports stages, enforces a deadline, and offers chat recovery if it stalls. Camera inference has not yet been moved to an isolated worker, so a native driver crash can still end full Vision while the launcher remains open.
- Vision Stop requests an authenticated local shutdown; Hub Stop attempts a window-close signal. The 15-second deadline starts at the Stop request, including HTTP time. A missed deadline becomes **Could not stop**, with **Force stop** available and continued observation for late exit. Start/Open remain disabled while stopping. Force stop terminates only the product instance's owned Windows Job Object and verifies all descendants exited before showing Stopped. Startup, uptime, shutdown and stage durations are separate; completed/failed durations freeze. The headless Hub development runtime may require Force stop.
- The launch health token and instance ID travel only in the child environment and local request header. A browser or an occupied port alone cannot establish readiness. Diagnostics write safe stage/exit metadata under `%LOCALAPPDATA%\Ascend\Desktop\logs`, not child stdout or chat text.

## Checks used during implementation

```powershell
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -STA -File 'desktop\Start-Ascend.ps1' -SelfTest
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -File 'desktop\tests\Test-Supervisor.ps1' -PythonExe 'D:\ascend-vision\ascend-vision\.venv\Scripts\python.exe'
```

The supervisor check uses isolated authenticated loopback fixture children, covering real shutdown deadlines, late exit, scoped ownership, repeated activation, legacy conflict, child/descendant termination, force-stop exceptions, cancellation races and frozen lifecycle durations. It never touches existing user applications.

Additional checks:

```powershell
powershell.exe -NoProfile -STA -File desktop/tests/Test-LauncherLayout.ps1 -AuditDirectory docs/audits/tv-launcher-assets
powershell.exe -NoProfile -STA -File desktop/tests/Test-NativeLaunchers.ps1 -PythonExe C:/Python314/python.exe
powershell.exe -NoProfile -File desktop/tests/Test-Installer.ps1
```

Layout checks render both actual XAML compositions with synthetic states, long messages, visible keyboard focus and 100/150/200% scale transforms; PNGs show the full scroll extent on the product background. They do not change Windows display settings. Native checks create temporary cloned fixture shortcuts, run real offscreen WPF windows with `-FixtureMode`, verify repeat-click restoration, Cancel closing, responsive Stop/Force stop and close-one-keeps-other. FixtureMode uses only the explicit test profile and suppresses taskbar/window placement. Normal shortcuts do not use it.

The installer fixture writes only temporary shortcut/profile files. Existing installations can retain all shortcut arguments, profile paths and working directories when updating only `IconLocation` to `desktop/assets/vision.ico,0` or `hub.ico,0`; do not force reinstall merely to update icons. Icon source is the shared static WPF geometry; `tests/Build-LauncherAssets.ps1` renders PNG/ICO assets at 32/48/64/128/256 pixels. No generated replacement eye artwork is used.

`tests/Test-LiveRecovery.ps1` is an optional separate live-runtime check requiring an explicitly selected profile. It is outside the fixture verification above.
