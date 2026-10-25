import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRoomToken } from "./token.mjs";

// The agent room is its own long-lived process: Hub's routes run in workerd, which cannot spawn it.
// shortcut: always spawns; a second copy binds first and exits on EADDRINUSE before touching anything (see room.log).
export function startAgentRoom() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  ensureRoomToken(join(root, ".env.local"));
  const logDir = join(root, ".sites-runtime", "agent-room");
  mkdirSync(logDir, { recursive: true });
  const log = openSync(join(logDir, "room.log"), "a");
  spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url))], {
    cwd: root, detached: true, stdio: ["ignore", log, log], windowsHide: true,
  }).unref();
}
