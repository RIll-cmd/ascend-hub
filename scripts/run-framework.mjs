import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRoomToken } from "./agent-room/token.mjs";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
const managedLinux = readExecutionProfile() === "managed-linux";

if (managedLinux && command === "build") {
  const result = spawnSync("bash", [
    fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// The agent room is its own long-lived process: Hub's routes run in workerd, which cannot spawn it.
// shortcut: always spawns; a second copy exits on EADDRINUSE (see room.log). Add a port check if that noise matters.
function startAgentRoom() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  ensureRoomToken(join(root, ".env.local"));
  const logDir = join(root, ".sites-runtime", "agent-room");
  mkdirSync(logDir, { recursive: true });
  const log = openSync(join(logDir, "room.log"), "a");
  spawn(process.execPath, [fileURLToPath(new URL("./agent-room/server.mjs", import.meta.url))], {
    cwd: root, detached: true, stdio: ["ignore", log, log], windowsHide: true,
  }).unref();
}

if (command === "dev" && !managedLinux) startAgentRoom();

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL(managedLinux
  ? "../node_modules/vite/bin/vite.js"
  : "../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173", "--host", "0.0.0.0"] : []), ...args];
await import(cli.href);
