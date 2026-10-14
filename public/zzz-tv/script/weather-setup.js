export class WeatherSetupPanel {
  constructor(channel) {
    this.channel = channel;
    this.lastState = null;
    this.panel = document.createElement("section");
    this.panel.className = "weather-setup-panel";
    this.panel.hidden = true;
    this.panel.setAttribute("aria-label", "Weather settings");
    this.settings = document.createElement("button");
    this.settings.type = "button";
    this.settings.className = "weather-settings-action";
    this.settings.textContent = "SETTINGS";
    this.settings.addEventListener("click", () => this.open());
    this.status = document.createElement("div");
    this.status.className = "weather-update-status";
    this.status.setAttribute("role", "status");
    channel.container.append(this.settings, this.status, this.panel);
  }
  apply(state) {
    this.lastState = state;
    this.channel.container.classList.toggle("weather-unconfigured", !state.data);
    this.settings.hidden = !state.data;
    this.status.textContent = state.stale ? `LAST UPDATE ${new Date(state.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · RETRY LATER` : "";
    if (!state.data && !this.editing) this.showSlate(state);
    if (state.data && !this.editing) this.panel.hidden = true;
  }
  showSlate(state) {
    this.panel.hidden = false;
    this.panel.replaceChildren();
    const label = document.createElement("p"); label.className = "weather-setup-kicker"; label.textContent = "WEATHER FORECAST";
    const title = document.createElement("h2"); title.textContent = state.status === "loading" ? "Receiving forecast…" : state.status === "missing-key" ? "Forecast needs setup" : "Forecast unavailable";
    const detail = document.createElement("p"); detail.textContent = state.message || (state.status === "loading" ? "Checking your weather connection." : "Add a Visual Crossing key for your local forecast.");
    if (state.status === "loading") { this.panel.append(label, title, detail); return; }
    const setup = document.createElement("button"); setup.type = "button"; setup.textContent = state.status === "missing-key" || state.status === "invalid-key" ? "SET UP FORECAST" : "WEATHER SETTINGS"; setup.addEventListener("click", () => this.open());
    this.panel.append(label, title, detail, setup);
    if (state.status === "unavailable") { const retry = document.createElement("button"); retry.type = "button"; retry.className = "weather-back-action"; retry.textContent = "TRY AGAIN"; retry.addEventListener("click", () => { retry.disabled = true; this.channel.updateWeather(); }); this.panel.append(retry); }
  }
  async open() {
    this.editing = true;
    this.panel.hidden = false;
    this.panel.innerHTML = '<p class="weather-setup-kicker">FORECAST SETTINGS</p><h2>Your local weather</h2><form><label>VISUAL CROSSING KEY <a href="https://www.visualcrossing.com/weather-api/" target="_blank" rel="noopener noreferrer">GET A KEY ↗</a><input name="apiKey" type="password" autocomplete="off" maxlength="256" placeholder="Paste your API key"></label><label>LOCATION<input name="location" required maxlength="160" autocomplete="off" placeholder="City, country"></label><fieldset><legend>TEMPERATURE</legend><label><input type="radio" name="units" value="metric" checked> CELSIUS</label><label><input type="radio" name="units" value="us"> FAHRENHEIT</label></fieldset><p class="weather-form-message" role="status"></p><div class="weather-form-actions"><button type="submit">SAVE &amp; CHECK</button><button class="weather-back-action" type="button">BACK</button></div></form>';
    const form = this.panel.querySelector("form"), message = this.panel.querySelector(".weather-form-message"), submit = form.querySelector('[type="submit"]');
    this.panel.querySelector(".weather-back-action").addEventListener("click", () => this.close());
    this.panel.onkeydown = event => { if (event.key === "Escape") { event.preventDefault(); this.close(); } };
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const data = new FormData(form);
      submit.disabled = true; message.textContent = "CHECKING FORECAST…";
      try {
        const response = await fetch("/api/weather/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: data.get("apiKey"), location: data.get("location"), units: data.get("units") }) });
        const result = await response.json();
        if (!response.ok || !result.success) { message.textContent = result.message || "Could not save. Try again."; return; }
        form.elements.apiKey.value = "";
        this.editing = false;
        await this.channel.updateWeather();
        this.settings.focus();
      } catch { message.textContent = "Hub could not be reached. Try again."; }
      finally { submit.disabled = false; }
    });
    try {
      const response = await fetch("/api/weather/setup");
      if (!response.ok) throw new Error("unavailable");
      const setup = await response.json();
      if (!this.editing || form !== this.panel.querySelector("form")) return;
      form.elements.location.value = setup.location || "Manila,PH";
      form.elements.units.value = setup.units === "us" ? "us" : "metric";
      form.elements.apiKey.required = !setup.configured;
      if (setup.configured) form.elements.apiKey.placeholder = "Saved key · leave blank to keep";
      form.elements.apiKey.focus();
    } catch { message.textContent = "Could not load settings. Enter a key and location."; }
  }
  close() {
    this.editing = false;
    if (this.lastState) this.apply(this.lastState);
    if (!this.settings.hidden) this.settings.focus();
    else this.panel.querySelector("button")?.focus();
  }
}
