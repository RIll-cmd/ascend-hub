import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startAgentRoom } from "./agent-room/launch.mjs";
import { isBuildFresh, readSourceStamp, writeBuildStamp } from "./build-stamp.mjs";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build", "serve"].includes(command)) throw new Error("Expected dev, build or serve.");
const managedLinux = readExecutionProfile() === "managed-linux";

if (managedLinux && command === "build") {
  const result = spawnSync("bash", [
    fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

if (command === "dev" && !managedLinux) startAgentRoom();

// serve: the production build on loopback only. It rebuilds only when sources changed since the last build.
if (command === "serve" && !managedLinux) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const stamp = readSourceStamp(root);
  if (!isBuildFresh(root, stamp)) {
    const built = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "build"], { cwd: root, stdio: "inherit" });
    if (built.status !== 0) process.exit(built.status ?? 1);
    writeBuildStamp(root, stamp);
  }
  startAgentRoom();
}

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL(managedLinux
  ? "../node_modules/vite/bin/vite.js"
  : "../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command === "serve" ? "start" : command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173", "--host", "0.0.0.0"] : []),
  ...(!managedLinux && command === "serve" ? ["--port", "5173", "--hostname", "127.0.0.1"] : []), ...args];
await import(cli.href);
