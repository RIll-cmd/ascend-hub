import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { resolveShelfTvService } from "../../components/status/shelf-tv-assignment";

test("the page remembers an empty instance ID once and retains it across refreshes", async () => {
  const source = await readFile("app/page.tsx", "utf8");
  const initializer = source.match(/const unrememberedSlots = (statusTvSlots\.filter\([^;]+\));/);
  assert.ok(initializer, "find the actual page initialization guard");
  const slotId = "slot-1-1-t";
  const nowMs = Date.parse("2026-10-05T00:00:00Z");
  const service = {
    serviceId: "ascend-core", instanceId: "", serviceType: "agent" as const,
    state: "idle" as const, stateSince: "2026-10-05T00:00:00Z",
    lastHeartbeatAt: "2026-10-05T00:00:00Z", staleAfterSeconds: 30,
  };
  const selectedStatusInstances: Record<string, string> = {};
  const statusTvSlots = [{ slotId, service: resolveShelfTvService(slotId, [service], undefined, nowMs) }];
  // Execute the real guard: a duplicated test predicate could miss a page render loop.
  const unremembered = () => runInNewContext(initializer[1], { statusTvSlots, selectedStatusInstances });
  assert.equal(unremembered().length, 1);
  selectedStatusInstances[slotId] = service.instanceId;
  assert.equal(unremembered().length, 0, "remembered empty ID must not schedule another render update");
  const replacement = { ...service, instanceId: "replacement", lastHeartbeatAt: "2026-10-05T00:00:01Z" };
  assert.equal(resolveShelfTvService(slotId, [service, replacement], selectedStatusInstances[slotId], nowMs + 1_000), service);
  assert.equal(resolveShelfTvService(slotId, [replacement], selectedStatusInstances[slotId], nowMs + 1_000), null);
});
