import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const testUrl = process.env.ASCEND_HOVER_TEST_URL;
const chromePath = process.env.ASCEND_CHROME_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

test("hovering the retro room does not paint a solid matte over its scene", {
  skip: !testUrl && "Set ASCEND_HOVER_TEST_URL to run the browser regression check",
}, async () => {
  const profile = await mkdtemp(join(tmpdir(), "ascend-hover-test-"));
  const browser = spawn(chromePath, [
    "--headless=new",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--window-size=1920,970",
    "about:blank",
  ], { stdio: "ignore" });
  browser.unref();

  let socket;
  try {
    let port;
    for (let attempt = 0; attempt < 50; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      try {
        port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]);
        break;
      } catch { /* Chrome is still starting. */ }
    }
    assert.ok(port, "Chrome's debugging port opened");

    const tab = await fetch(`http://127.0.0.1:${port}/json/new?${testUrl}`, {
      method: "PUT",
    }).then((response) => response.json());
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });

    let nextId = 0;
    const pending = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (!pending.has(message.id)) return;
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

    await send("Page.enable");
    await send("Runtime.enable");
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = await send("Runtime.evaluate", {
        expression: "Boolean(document.querySelector('.retro-room-flat-backdrop')?.complete)",
        returnByValue: true,
      });
      if (result.result.value) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // The streamed page can paint its background before client-side hydration.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved", x: 960, y: 450, button: "none",
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const sceneTransform = (await send("Runtime.evaluate", {
      expression: "getComputedStyle(document.querySelector('.retro-room-flat-stage')).transform",
      returnByValue: true,
    })).result.value;
    assert.equal(sceneTransform, "none", "The room must remain flat when hovered");
    const screenshot = Buffer.from((await send("Page.captureScreenshot", {
      format: "png", captureBeyondViewport: false,
    })).data, "base64");
    if (process.env.ASCEND_HOVER_SCREENSHOT) {
      await writeFile(process.env.ASCEND_HOVER_SCREENSHOT, screenshot);
    }
    const { data, info } = await sharp(screenshot)
      .extract({ left: 300, top: 150, width: 1300, height: 500 })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let mattePixels = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] === 16 && data[i + 1] === 11 && data[i + 2] === 21) mattePixels++;
    }
    const matteFraction = mattePixels / (info.width * info.height);
    assert.ok(matteFraction < 0.05,
      `The scene should stay visible on hover; ${(matteFraction * 100).toFixed(1)}% was solid matte`);
  } finally {
    socket?.close();
    browser.kill();
  }
});
