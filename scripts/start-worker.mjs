import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startAgentRoom } from "./agent-room/launch.mjs";
import { readExecutionProfile } from "./execution-profile.mjs";

// npm start: the built Worker through Wrangler, plus the agent room, as `npm run serve` and `npm run dev` start it.
const root = fileURLToPath(new URL("../", import.meta.url));
if (readExecutionProfile() !== "managed-linux") startAgentRoom();
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const result = spawnSync(process.execPath, ["--import", "./scripts/sites-env.mjs", wrangler, "dev", "--config", "dist/server/wrangler.json", "--local",
  "--persist-to", ".wrangler/state", "--ip", "127.0.0.1", "--inspector-port", "0", ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
