// Account setup stays on the music screen; credentials never cross the host bridge.
export function initSpotifySetup(media) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "tv-channel-account-trigger";
  trigger.textContent = "Connect Spotify";
  trigger.setAttribute("aria-label", "Connect Spotify account");
  media.mediaTitleContainer.append(trigger);
  const panel = document.createElement("section");
  panel.className = "tv-channel-setup tv-channel-setup--music";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Spotify account setup");
  media.container.append(panel);
  let setup = null;
  let busy = false;
  let connected = false;

  const notice = (text) => {
    const element = panel.querySelector(".tv-channel-notice");
    if (element) element.textContent = text;
  };
  const close = () => {
    if (busy) return;
    panel.hidden = true;
    media.container.classList.remove("tv-channel-account-open");
    panel.replaceChildren(); // Do not retain entered secrets in hidden DOM.
    trigger.focus();
  };
  const authorize = () => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "SPOTIFY_AUTHORIZE", returnInput: "music" }, location.origin);
    } else {
      sessionStorage.setItem("tv-spotify-return", "music");
      location.assign("/api/spotify/login");
    }
  };
  async function request(url, options) {
    const response = await fetch(url, { cache: "no-store", ...options });
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error("request-failed");
    return data;
  }
  const setBusy = (value) => {
    busy = value;
    panel.setAttribute("aria-busy", String(value));
    panel.querySelectorAll("button, input").forEach((element) => { element.disabled = value; });
  };
  function showForm(message = "") {
    panel.innerHTML = `<div class="tv-channel-kicker">SPOTIFY / ACCOUNT LINK</div>
      <h2 class="tv-channel-title">Connect your music</h2>
      <form class="tv-channel-form">
        <label class="tv-channel-field">Client ID<input name="clientId" required autocomplete="off" spellcheck="false"></label>
        <label class="tv-channel-field">Client Secret<input name="clientSecret" type="password" required autocomplete="off"></label>
        <div class="tv-channel-callback"><span>Callback address</span><code></code><button type="button" data-copy>Copy</button></div>
        <p class="tv-channel-notice" role="status" aria-live="polite"></p>
        <div class="tv-channel-actions"><button class="tv-channel-primary" type="submit">Save &amp; connect</button><button class="tv-channel-secondary" type="button" data-back>Back</button></div>
        <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Spotify developer settings</a>
      </form>`;
    // Existing credentials may come from the environment; do not overwrite them.
    for (const [name, configured] of [["clientId", setup?.hasClientId], ["clientSecret", setup?.hasClientSecret]]) {
      const input = panel.querySelector(`[name="${name}"]`);
      input.required = !configured;
      input.placeholder = configured ? "Already saved — leave blank to keep" : "Paste from Spotify developer settings";
    }
    const callback = `${location.origin.replace("localhost", "127.0.0.1")}/api/spotify/callback`;
    panel.querySelector("code").textContent = callback;
    panel.querySelector("[data-copy]").onclick = async () => {
      try { await navigator.clipboard.writeText(callback); notice("Callback address copied."); }
      catch { notice("Select and copy the callback address above."); }
    };
    panel.querySelector("[data-back]").onclick = () => showConnect();
    panel.querySelector("form").onsubmit = async (event) => {
      event.preventDefault();
      if (busy) return;
      const form = new FormData(event.currentTarget);
      const clientId = String(form.get("clientId") || "").trim();
      const clientSecret = String(form.get("clientSecret") || "").trim();
      if ((!clientId && !setup?.hasClientId) || (!clientSecret && !setup?.hasClientSecret)) {
        notice("Client ID and Client Secret are required."); return;
      }
      setBusy(true);
      notice("Saving account settings…");
      try {
        await request("/api/spotify/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(clientId && { clientId }), ...(clientSecret && { clientSecret }), demoMode: false }) });
        panel.querySelectorAll("input").forEach((input) => { input.value = ""; });
        notice("Opening Spotify authorization…");
        authorize();
      } catch { notice("Settings could not be saved. Please try again."); }
      finally { setBusy(false); }
    };
    notice(message);
    panel.querySelector("input").focus();
  }
  function showConnect(message = "") {
    const configured = setup?.hasClientId && setup?.hasClientSecret;
    panel.innerHTML = `<div class="tv-channel-kicker">SPOTIFY / ACCOUNT</div>
      <h2 class="tv-channel-title">Your music, on this TV</h2>
      <p class="tv-channel-account-copy">Link Spotify to show your album artwork, track and playback on the music channel.</p>
      <p class="tv-channel-notice" role="status" aria-live="polite"></p>
      <div class="tv-channel-actions"><button type="button" class="tv-channel-primary" data-connect>Connect Spotify</button><button type="button" class="tv-channel-secondary" data-back>Back</button></div>
      <button type="button" class="tv-channel-settings-link" data-settings>Account settings</button>`;
    notice(message || (configured ? "Ready to link. Spotify will ask you to authorize this TV." : "First connection? Add this TV’s Spotify app settings once, then authorize your account."));
    panel.querySelector("[data-back]").onclick = close;
    panel.querySelector("[data-settings]").onclick = () => showForm();
    panel.querySelector("[data-connect]").onclick = async () => {
      if (!configured) { showForm(); return; }
      setBusy(true);
      try {
        if (setup.demoMode) await request("/api/spotify/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demoMode: false }) });
        authorize();
      } catch { notice("Could not open Spotify. Please try again."); }
      finally { setBusy(false); }
    };
    panel.querySelector("[data-connect]").focus();
  }
  function showAccount(message = "") {
    panel.innerHTML = `<div class="tv-channel-kicker">SPOTIFY / ACCOUNT</div><h2 class="tv-channel-title">${connected ? "Music connected" : "Reconnect your music"}</h2>
      <p class="tv-channel-notice" role="status" aria-live="polite"></p><div class="tv-channel-actions"><button type="button" class="tv-channel-primary" data-connect>Reconnect</button><button type="button" class="tv-channel-secondary" data-disconnect>Disconnect</button><button type="button" class="tv-channel-secondary" data-back>Back</button></div>`;
    notice(message || (connected ? "Your Spotify account is linked to this TV." : "Authorize again to resume your Spotify connection."));
    panel.querySelector("[data-connect]").onclick = authorize;
    panel.querySelector("[data-back]").onclick = close;
    panel.querySelector("[data-disconnect]").onclick = async () => {
      setBusy(true);
      try {
        await request("/api/spotify/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect" }) });
        connected = false;
        setup = null;
        await media.pollSpotify();
        setBusy(false);
        close();
      } catch { setBusy(false); notice("Could not disconnect. Your account settings have been kept."); }
    };
    panel.querySelector("[data-back]").focus();
  }
  async function open(forceSetup = false, message = "") {
    panel.hidden = false;
    media.container.classList.add("tv-channel-account-open");
    panel.innerHTML = `<p class="tv-channel-notice" role="status">Checking account settings…</p>`;
    try {
      setup = await request("/api/spotify/setup");
      if (setup.hasRefreshToken && !setup.demoMode) showAccount(message);
      else showConnect(message);
    } catch {
      panel.innerHTML = `<p class="tv-channel-notice" role="status">Account settings are unavailable. Try again.</p><button class="tv-channel-secondary" type="button">Back</button>`;
      panel.querySelector("button").onclick = close;
    }
  }
  trigger.onclick = () => open();
  window.addEventListener("tv-input-changed", (event) => {
    if (event.detail?.inputType !== "music" && !busy) {
      panel.hidden = true;
      media.container.classList.remove("tv-channel-account-open");
      panel.replaceChildren();
    }
  });
  panel.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } });
  media.container.addEventListener("spotify-playback", (event) => {
    connected = Boolean(event.detail.connected && !event.detail.demoMode);
    trigger.textContent = connected ? "Account" : "Connect Spotify";
    trigger.setAttribute("aria-label", connected ? "Manage Spotify account" : "Connect Spotify account");
    media.container.classList.toggle("tv-channel-spotify-linked", connected);
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== "SPOTIFY_AUTH_RESULT") return;
    const outcome = event.data.outcome;
    if (outcome === "connected") {
      connected = true;
      media.pollSpotify();
      open(true, "Account connected. Start a song in Spotify to hear your music.");
    } else if (outcome === "error" || outcome === "missing_client_id") {
      open(true, outcome === "error" ? "Authorization was cancelled or failed. You can try again." : "Add your Spotify developer credentials to continue.");
    }
  });
  return { open, close };
}
