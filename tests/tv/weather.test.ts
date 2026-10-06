import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWeatherService, normalizeWeather } from "../../lib/weather";

const fixture = { resolvedAddress: "Manila, Philippines", currentConditions: { temp: 28, feelslike: 30, humidity: 71, windspeed: 18, icon: "cloudy" }, days: [{ datetime: "2026-10-06", temp: 28, tempmin: 25, tempmax: 31, precipprob: 40, icon: "rain" }] };
const working = { apiKey: "private-working-key", location: "Manila,PH", units: "metric" as const };
async function storage(t: TestContext) { const directory = await mkdtemp(path.join(tmpdir(), "hub-weather-")); t.after(() => rm(directory, { recursive: true, force: true })); return path.join(directory, "weather.json"); }
const response = () => Response.json(fixture);

test("missing weather key is an explicit setup state without provider calls", async () => {
  const service = createWeatherService({ file: path.join(tmpdir(), "missing-weather-config.json"), env: {}, fetcher: async () => { throw new Error("must not fetch"); } });
  assert.equal((await service.current()).status, "missing-key");
  assert.equal((await service.setup()).configured, false);
});
test("saved configuration survives restart; keys never leave public contracts", async t => {
  const file = await storage(t);
  const service = createWeatherService({ file, env: {}, fetcher: async () => response() });
  const result = await service.save(working);
  assert.equal(result.success, true);
  const fresh = createWeatherService({ file, env: {}, fetcher: async () => response() });
  assert.equal((await fresh.setup()).configured, true);
  assert.equal((await fresh.current()).status, "ready");
  assert.ok(!JSON.stringify([result, await fresh.setup(), await fresh.current()]).includes(working.apiKey));
});
test("invalid candidate preserves a previous working configuration", async t => {
  const file = await storage(t); await writeFile(file, JSON.stringify(working));
  const service = createWeatherService({ file, env: {}, fetcher: async () => new Response("secret-invalid-key", { status: 401 }) });
  const result = await service.save({ ...working, apiKey: "secret-invalid-key" });
  assert.equal(result.success, false);
  assert.equal(result.status, "invalid-key");
  assert.equal(JSON.parse(await readFile(file, "utf8")).apiKey, working.apiKey);
  assert.ok(!JSON.stringify(result).includes("secret-invalid-key"));
});
test("failed persistence reports failure", async t => {
  const file = await storage(t); await writeFile(file, "blocks-directory");
  const service = createWeatherService({ file: path.join(file, "child.json"), env: {}, fetcher: async () => response() });
  const result = await service.save(working);
  assert.equal(result.success, false);
  assert.ok("reason" in result && result.reason === "persistence");
});
test("provider timeout is bounded and sanitized", async t => {
  const file = await storage(t);
  const service = createWeatherService({ file, env: { VISUAL_CROSSING_API_KEY: working.apiKey }, timeoutMs: 10, fetcher: async () => new Promise<Response>(() => {}) });
  const result = await service.current();
  assert.equal(result.status, "unavailable");
  assert.ok("reason" in result && result.reason === "timeout");
  assert.ok(!JSON.stringify(result).includes(working.apiKey));
});
test("15 minute cache and stale forecast preserve the true last update", async t => {
  const file = await storage(t); let time = Date.parse("2026-10-06T10:00:00Z"), calls = 0;
  const service = createWeatherService({ file, env: { VISUAL_CROSSING_API_KEY: working.apiKey }, now: () => time, fetcher: async () => ++calls === 1 ? response() : new Response("rate limit", { status: 429 }) });
  const first = await service.current();
  time += 1000; await service.current(); assert.equal(calls, 1);
  time += 15 * 60 * 1000;
  const stale = await service.current();
  assert.equal(stale.stale, true); assert.equal(stale.fetchedAt, first.fetchedAt);
  assert.equal(stale.status, "unavailable"); assert.ok("reason" in stale && stale.reason === "quota");
});
test("normalization keeps missing values unavailable and maps metric/us winds correctly", () => {
  const metric = normalizeWeather(fixture, working);
  assert.equal(metric.data.wind.speed, 5); assert.equal(metric.forecastData.list[0].pop, .4);
  assert.equal(normalizeWeather(fixture, { ...working, units: "us" }).data.wind.speed, 18);
  const missing = normalizeWeather({ currentConditions: {}, days: [] }, working);
  assert.equal(missing.data.main.temp, null); assert.equal(missing.data.main.humidity, null); assert.equal(missing.data.weather[0].main, "Unavailable");
});
test("blank replacement keeps existing key but changes location; invalid units are rejected", async t => {
  const file = await storage(t); await writeFile(file, JSON.stringify(working));
  let requested = "";
  const service = createWeatherService({ file, env: {}, fetcher: async url => { requested = String(url); return response(); } });
  assert.equal((await service.save({ apiKey: "", location: "Paris,FR", units: "us" })).success, true);
  assert.ok(requested.includes("Paris%2CFR")); assert.ok(requested.includes("unitGroup=us"));
  assert.equal((await service.save({ ...working, units: "fake" })).success, false);
});
