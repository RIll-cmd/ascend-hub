import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";

type Config = { apiKey: string; location: string; units: "metric" | "us" };
export type WeatherSetup = { configured: boolean; provider: "visual-crossing"; location: string; units: Config["units"]; source: "local" | "environment" | "none" };
type ProviderDay = { datetime?: string; temp?: number; tempmin?: number; tempmax?: number; feelslike?: number; humidity?: number; windspeed?: number; precipprob?: number; icon?: string; conditions?: string };
type ProviderData = { resolvedAddress?: string; currentConditions?: ProviderDay; days?: ProviderDay[] };
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
function condition(day: ProviderDay) {
  const text = `${day.icon || ""} ${day.conditions || ""}`.toLowerCase();
  if (/thunder/.test(text)) return "Thunderstorm";
  if (/snow/.test(text)) return "Snow";
  if (/drizzle/.test(text)) return "Drizzle";
  if (/rain|shower/.test(text)) return "Rain";
  if (/fog|mist/.test(text)) return "Fog";
  if (/cloud|overcast/.test(text)) return "Clouds";
  if (/clear|sun/.test(text)) return "Clear";
  return "Unavailable";
}
export function normalizeWeather(raw: ProviderData, config: Config) {
  const current = raw.currentConditions || {};
  return {
    data: { main: { temp: number(current.temp), feels_like: number(current.feelslike), humidity: number(current.humidity) }, weather: [{ main: condition(current), description: current.conditions || "Unavailable" }], wind: { speed: number(current.windspeed) === null ? null : current.windspeed! / (config.units === "metric" ? 3.6 : 1) } },
    forecastData: { list: (Array.isArray(raw.days) ? raw.days : []).slice(0, 6).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day.datetime || "")).map(day => ({ dt_txt: `${day.datetime} 12:00:00`, main: { temp: number(day.temp), temp_min: number(day.tempmin), temp_max: number(day.tempmax) }, weather: [{ main: condition(day) }], pop: number(day.precipprob) === null ? null : day.precipprob! / 100 })) },
    location: [{ name: raw.resolvedAddress?.split(",")[0]?.trim() || config.location }],
  };
}
type Normalized = ReturnType<typeof normalizeWeather>;
type Reason = "invalid-key" | "location" | "quota" | "timeout" | "network" | "persistence" | "invalid-config";
class WeatherError extends Error { constructor(public reason: Reason) { super(reason); } }
const messages: Record<Reason, string> = { "invalid-key": "The provider rejected this key. Check it and try again.", location: "Location not found. Try a city and country.", quota: "Weather request limit reached. Try again later.", timeout: "Weather took too long to respond. Try again.", network: "Weather is temporarily unavailable. Try again.", persistence: "Could not save weather settings. Your previous settings are unchanged.", "invalid-config": "Enter a key, location, and valid temperature unit." };

export function createWeatherService(options: { file?: string; env?: Record<string, string | undefined>; fetcher?: typeof fetch; now?: () => number; timeoutMs?: number } = {}) {
  const file = options.file || path.join(process.cwd(), ".sites-runtime", "weather-config.json");
  const env = options.env || process.env;
  const fetcher = options.fetcher || fetch;
  const now = options.now || Date.now;
  const cache = new Map<string, { fetchedAt: string; time: number; normalized: Normalized }>();
  let saving: Promise<unknown> = Promise.resolve();
  async function config(): Promise<{ value: Config; source: WeatherSetup["source"] }> {
    try {
      const stored = JSON.parse(await readFile(file, "utf8"));
      if (typeof stored.apiKey === "string" && stored.apiKey.trim()) return { value: { apiKey: stored.apiKey, location: typeof stored.location === "string" && stored.location.trim() ? stored.location : "Manila,PH", units: stored.units === "us" ? "us" : "metric" }, source: "local" };
    } catch { /* Missing or malformed local configuration falls back to environment. */ }
    const apiKey = env.VISUAL_CROSSING_API_KEY?.trim() || "";
    return { value: { apiKey, location: env.WEATHER_LOCATION?.trim() || "Manila,PH", units: env.WEATHER_UNITS === "us" ? "us" : "metric" }, source: apiKey ? "environment" : "none" };
  }
  const safe = (value: Config, source: WeatherSetup["source"]): WeatherSetup => ({ configured: Boolean(value.apiKey), provider: "visual-crossing", location: value.location, units: value.units, source });
  const cacheKey = (value: Config) => JSON.stringify(value);
  async function provider(value: Config) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const url = new URL(`https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(value.location)}`);
      url.search = new URLSearchParams({ unitGroup: value.units, key: value.apiKey, contentType: "json", include: "current,days" }).toString();
      const request = async () => {
      const response = await fetcher(url, { signal: controller.signal });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new WeatherError("invalid-key");
        if (response.status === 429) throw new WeatherError("quota");
        if (response.status === 400) { const detail = await response.text(); throw new WeatherError(/api.?key|key.*invalid|invalid.*key/i.test(detail) ? "invalid-key" : "location"); }
        throw new WeatherError("network");
      }
      const data = await response.json() as ProviderData;
      if (!data || (!data.currentConditions && !Array.isArray(data.days))) throw new WeatherError("network");
      return normalizeWeather(data, value);
      };
      return await Promise.race([request(), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new WeatherError("timeout")); }, options.timeoutMs ?? 10000); })]);
    } catch (error) { throw error instanceof WeatherError ? error : new WeatherError("network"); }
    finally { if (timer) clearTimeout(timer); }
  }
  function failure(error: unknown) { const reason = error instanceof WeatherError ? error.reason : "network"; return { status: reason === "invalid-key" ? "invalid-key" as const : "unavailable" as const, reason, message: messages[reason] }; }
  return {
    async setup() { const loaded = await config(); return safe(loaded.value, loaded.source); },
    async save(input: unknown) {
      const operation = saving.then(async () => {
        const previous = await config();
        const body = input as Partial<Config> | null;
        if (!body || typeof body !== "object" || typeof body.apiKey !== "string" || typeof body.location !== "string" || (body.units !== "metric" && body.units !== "us")) throw new WeatherError("invalid-config");
        const candidate: Config = { apiKey: body.apiKey.trim() || previous.value.apiKey, location: body.location.trim(), units: body.units };
        if (!candidate.apiKey || candidate.apiKey.length > 256 || !candidate.location || candidate.location.length > 160 || /[\x00-\x1f]/.test(candidate.location)) throw new WeatherError("invalid-config");
        const normalized = await provider(candidate);
        try { await mkdir(path.dirname(file), { recursive: true }); await writeFile(`${file}.tmp`, JSON.stringify(candidate), { mode: 0o600 }); await rename(`${file}.tmp`, file); } catch { throw new WeatherError("persistence"); }
        cache.clear();
        cache.set(cacheKey(candidate), { normalized, fetchedAt: new Date(now()).toISOString(), time: now() });
        return { success: true, setup: safe(candidate, "local"), status: "ready" as const };
      });
      saving = operation.catch(() => undefined);
      try { return await operation; } catch (error) { return { success: false, ...failure(error) }; }
    },
    async current() {
      const loaded = await config();
      const setup = safe(loaded.value, loaded.source);
      if (!setup.configured) return { status: "missing-key" as const, setup, fetchedAt: null, stale: false };
      const key = cacheKey(loaded.value), existing = cache.get(key);
      if (existing && now() - existing.time < 15 * 60 * 1000) return { status: "ready" as const, setup, fetchedAt: existing.fetchedAt, stale: false, ...existing.normalized };
      try {
        const normalized = await provider(loaded.value), fetchedAt = new Date(now()).toISOString();
        cache.set(key, { normalized, fetchedAt, time: now() });
        return { status: "ready" as const, setup, fetchedAt, stale: false, ...normalized };
      } catch (error) { return { ...failure(error), setup, fetchedAt: existing?.fetchedAt || null, stale: Boolean(existing), ...(existing?.normalized || {}) }; }
    },
  };
}
export const weatherService = createWeatherService();
