# Ascend Desktop launcher (Windows)

The launcher has independent **Start Vision** and **Start Hub** controls and two desktop shortcuts. It starts only the app you select. It stays responsive while a child imports models, optimizes frontend dependencies, or fails a health check. Each app has its own Stop, Cancel/Force stop, Retry, and Open actions.

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

You may open the controls without starting either app:

```powershell
& 'D:\ascend_hub\desktop\Start-Ascend.ps1'
```

The app starts Hub on the local profile's port (5173 by default) and Vision on its own ephemeral loopback port. After authenticated health responds, it opens the correct browser page. A second shortcut click sends a start request to the existing launcher instead of creating a second camera owner. Closing the launcher asks before stopping its owned apps.

## Current release limits

- Hub uses its local Vinext development runtime. The built Wrangler runtime cannot start with the current media library: multiple videos exceed its 25 MiB asset limit. The launcher keeps that portable profile unverified. This means the first Hub start may spend time optimizing dependencies; progress and Cancel remain available.
- Full Vision still performs native model/camera initialization in its main process. The launcher reports stages, enforces a deadline, and offers chat recovery if it stalls. Camera inference has not yet been moved to an isolated worker, so a native driver crash can still end full Vision while the launcher remains open.
- Vision Stop requests an authenticated local shutdown and waits up to 15 seconds for cleanup. Hub Stop attempts a window-close signal; its headless development process may require **Cancel / Force stop**. Force stop terminates only the child tree owned by this launcher; it does not terminate unrelated Python or Node instances.
- The launch health token and instance ID travel only in the child environment and local request header. A browser or an occupied port alone cannot establish readiness. Diagnostics write safe stage/exit metadata under `%LOCALAPPDATA%\Ascend\Desktop\logs`, not child stdout or chat text.

## Checks used during implementation

```powershell
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -STA -File 'desktop\Start-Ascend.ps1' -SelfTest
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -File 'desktop\tests\Test-Supervisor.ps1' -PythonExe 'D:\ascend-vision\ascend-vision\.venv\Scripts\python.exe'
```

The second check uses its own loopback fixture children. It verifies hung startup, independent product health, cancellation, early exit, wrong identity, and no raw child output in diagnostics. `desktop/tests/Test-LiveRecovery.ps1` additionally starts the real local Hub and Vision chat recovery host using an explicitly selected profile; it does not open a browser, camera, or model request.
