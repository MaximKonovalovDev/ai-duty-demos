// tools/lib/browser.mjs: drive Edge or Chrome headless through the DevTools protocol, no dependencies.
// One browser launch serves many pages (print to PDF, screenshot, run script, collect console errors
// and failed requests). Needs Node 22+ (global WebSocket) and an installed Edge or Chrome.
// The browser is closed with the protocol's Browser.close, never killed.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function browserPath() {
  const list = [process.env.DEMO_BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"].filter(Boolean);
  const p = list.find((x) => existsSync(x));
  if (!p) throw new Error("no Edge or Chrome found (set DEMO_BROWSER to its path)");
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ timeoutMs = 45000 } = {}) {
  if (typeof WebSocket === "undefined") throw new Error("global WebSocket missing: Node 22+ needed");
  const dir = mkdtempSync(join(tmpdir(), "jh-browser-"));
  const child = spawn(browserPath(), ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore", windowsHide: true });
  let exited = false;
  child.on("exit", () => { exited = true; });
  const portFile = join(dir, "DevToolsActivePort");
  const t0 = Date.now();
  while (!existsSync(portFile)) {
    if (exited || Date.now() - t0 > timeoutMs) throw new Error("browser did not start");
    await sleep(100);
  }
  await sleep(100);
  const [port, path] = readFileSync(portFile, "utf8").trim().split(/\r?\n/);
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("devtools socket failed")); });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(`${msg.error.message}`)); else res(msg.result ?? {});
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(`timeout ${method}`)); } }, 60000);
  });

  async function newPage({ width = 1280, height = 900 } = {}) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    const events = { console: [], exceptions: [], failedRequests: [], badResponses: [], dialogs: [] };
    let loadResolvers = [];
    const onEvent = (msg) => {
      if (msg.sessionId !== sessionId) return;
      const p = msg.params ?? {};
      if (msg.method === "Runtime.consoleAPICalled") events.console.push({ type: p.type, text: (p.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ") });
      else if (msg.method === "Runtime.exceptionThrown") events.exceptions.push({ text: p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? "exception" });
      else if (msg.method === "Log.entryAdded") events.console.push({ type: p.entry?.level, text: p.entry?.text ?? "", url: p.entry?.url });
      else if (msg.method === "Network.loadingFailed") events.failedRequests.push({ id: p.requestId, error: p.errorText, canceled: !!p.canceled });
      else if (msg.method === "Network.responseReceived") { if ((p.response?.status ?? 0) >= 400) events.badResponses.push({ url: p.response.url, status: p.response.status }); }
      else if (msg.method === "Page.javascriptDialogOpening") { events.dialogs.push({ type: p.type, message: p.message }); s("Page.handleJavaScriptDialog", { accept: false }).catch(() => {}); }
      else if (msg.method === "Page.loadEventFired") { const r = loadResolvers; loadResolvers = []; r.forEach((f) => f()); }
    };
    listeners.add(onEvent);
    await Promise.all(["Page.enable", "Runtime.enable", "Log.enable", "Network.enable"].map((m) => s(m)));
    await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    return {
      events,
      async goto(url, { settleMs = 400 } = {}) {
        const loaded = new Promise((r) => { loadResolvers.push(r); setTimeout(r, 30000); });
        await s("Page.navigate", { url });
        await loaded;
        await sleep(settleMs);
      },
      gotoFile(path, opts) { return this.goto(pathToFileURL(path).href, opts); },
      async eval(expression) {
        const r = await s("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result?.value;
      },
      async pdf(opts = {}) {
        const r = await s("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, ...opts });
        return Buffer.from(r.data, "base64");
      },
      async screenshot({ width: w = 794, height: h = 1123, fullPage = false, scale = 1, clip = null } = {}) {
        await s("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: scale, mobile: false });
        const r = await s("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
        return Buffer.from(r.data, "base64");
      },
      async close() {
        listeners.delete(onEvent);
        try { await send("Target.closeTarget", { targetId }); } catch { /* already closed */ }
      },
    };
  }

  async function close() {
    try { await send("Browser.close"); } catch { /* socket closes with the browser */ }
    const t = Date.now();
    while (!exited && Date.now() - t < 15000) await sleep(100);
    try { ws.close(); } catch { /* ignore */ }
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* the browser may still hold a file */ }
  }

  return { newPage, close };
}

/** Run fn(browser) and always close the browser. */
export async function withBrowser(fn) {
  const b = await launch();
  try { return await fn(b); } finally { await b.close(); }
}
