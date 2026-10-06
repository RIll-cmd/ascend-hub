"""Run with Python + Playwright: python tests/tv/channel-ui.browser.py.

Serves the real TV assets locally; provider requests are deterministic fixtures.
No real credentials are saved or provider authorization performed.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "scratch" / "channel-review"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT / "public")))
Thread(target=server.serve_forever, daemon=True).start()
ARTIFACTS.mkdir(parents=True, exist_ok=True)
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("https://www.youtube.com/iframe_api", lambda route: route.abort())
        fixtures = {
            "spotify/setup": {"hasClientId": False, "hasClientSecret": False, "hasRefreshToken": False},
            "spotify/currently-playing": {"connected": False},
            "weather/current": {"status": "missing-key", "message": "Add a Visual Crossing key for your local forecast."},
            "weather/setup": {"configured": False, "location": "Manila,PH", "units": "metric"},
            "youtube/search*": {"source": "preset", "results": [{"id": "jfKfPfyJRdk", "title": "Music for late nights", "author": "Lofi Girl", "duration": "Tune"}]},
            "zzz-videos": [],
        }
        for endpoint, data in fixtures.items():
            page.route(f"**/api/{endpoint}", lambda route, request, payload=data: route.fulfill(json=payload))
        page.goto(f"http://127.0.0.1:{server.server_port}/zzz-tv/index.html", wait_until="domcontentloaded")
        page.wait_for_selector(".tv-channel-account-trigger", state="attached")

        def select(name):
            page.evaluate("name => window.postMessage({type:'SELECT_INPUT',input:name},location.origin)", name)
            page.wait_for_timeout(1100)

        def capture(name):
            page.locator("#tv-container").screenshot(path=str(ARTIFACTS / f"{name}.png"))

        select("music")
        page.get_by_role("button", name="Connect Spotify account").click()
        page.locator(".tv-channel-setup [data-connect]").click()
        page.locator(".tv-channel-setup input[name=clientId]").wait_for()
        assert page.locator(".tv-channel-setup input[name=clientSecret]").get_attribute("type") == "password"
        capture("spotify-setup")
        page.locator(".tv-channel-setup [data-back]").click()
        assert page.locator(".tv-channel-setup input").count() == 0

        select("weather")
        page.get_by_role("button", name="SET UP FORECAST").click()
        location = page.locator(".weather-setup-panel input[name=location]")
        expect(location).to_have_value("Manila,PH")
        assert page.locator(".weather-setup-panel input[name=apiKey]").get_attribute("type") == "password"
        capture("weather-setup")

        select("youtube")
        chooser = "#yt-choose-video" if page.locator("#yt-channel-slate").is_visible() else "#crt-yt-tuner-trigger"
        page.locator(chooser).click()
        page.locator(".tv-broadcast-row").wait_for()
        assert "Recommendations" in page.locator("#tuner-error-banner").inner_text()
        capture("youtube-picker")
        page.locator("#tuner-close-btn").click()
        for code in [100, 101, 150, 153]:
            page.evaluate("code => window.dispatchEvent(new CustomEvent('yt-error',{detail:{code}}))", code)
            assert page.locator("#yt-channel-slate").is_visible()
        capture("youtube-error")
        select("music")
        page.evaluate("window.dispatchEvent(new CustomEvent('yt-error',{detail:{code:100}}))")
        assert not page.locator("#yt-channel-slate").is_visible()
        assert not page.locator("#crt-yt-tuner-panel").is_visible()

        page.set_viewport_size({"width": 390, "height": 844})
        page.get_by_role("button", name="Connect Spotify account").click()
        page.locator(".tv-channel-setup [data-connect]").click()
        page.locator(".tv-channel-setup input[name=clientId]").wait_for()
        bounds = page.locator("#tv-container").bounding_box()
        assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= 391, bounds
        save = page.get_by_role("button", name="Save & connect")
        save.scroll_into_view_if_needed()
        assert save.is_visible()
        capture("spotify-mobile")
        select("weather")
        page.locator(".weather-settings-action").count()
        save_weather = page.get_by_role("button", name="SAVE & CHECK")
        save_weather.scroll_into_view_if_needed()
        assert save_weather.is_visible()
        capture("weather-mobile")
        assert not errors, errors
        browser.close()
        print("PASS: TV setup, native tuner/errors, channel isolation, secret field cleanup, and mobile access")
finally:
    server.shutdown()
    server.server_close()
