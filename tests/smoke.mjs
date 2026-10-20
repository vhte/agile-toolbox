#!/usr/bin/env node
/* ==========================================================================
   Smoke test: opens every page from file://, the way a user double-clicking
   index.html would, and fails on any console error, uncaught exception or
   failed scenario. Zero dependencies: it talks to a headless Chrome over the
   DevTools protocol with Node's built-in WebSocket (Node 22+).

     node tests/smoke.mjs                 every page
     node tests/smoke.mjs flow decisions  only pages whose path contains these
     SHOTS=1 node tests/smoke.mjs         also save screenshots to tests/shots/

   Chrome is looked up in CHROME, then the usual install paths, then the
   Playwright cache. Contributors never need this to use the toolbox; it is
   only here so a change can be checked in one command.
   ========================================================================== */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCENARIOS = join(ROOT, "tests", "scenarios");
const SHOTS = process.env.SHOTS ? join(ROOT, "tests", "shots") : null;

const PAGES = [
  "index.html",
  ...readdirSync(join(ROOT, "tools"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, "tools", d.name, "index.html")))
    .map((d) => "tools/" + d.name + "/index.html")
];

function findChrome() {
  const candidates = [process.env.CHROME,
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (existsSync(cache)) {
    readdirSync(cache).filter((d) => /^chromium/.test(d)).sort().reverse().forEach((d) => {
      candidates.push(join(cache, d, "chrome-headless-shell-linux64", "chrome-headless-shell"));
      candidates.push(join(cache, d, "chrome-linux", "chrome"));
      candidates.push(join(cache, d, "chrome-linux64", "chrome"));
    });
  }
  return candidates.find((p) => p && existsSync(p));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(bin) {
  const profile = mkdtempSync(join(tmpdir(), "atbx-smoke-"));
  const proc = spawn(bin, ["--headless=new", "--no-sandbox", "--disable-gpu",
    "--allow-file-access-from-files", "--remote-debugging-port=0",
    "--user-data-dir=" + profile, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = "";
    const t = setTimeout(() => rej(new Error("Chrome did not start")), 15000);
    proc.stderr.on("data", (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); res(m[1]); }
    });
  });
  return { proc, wsUrl, profile };
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else listeners.forEach((fn) => fn(msg));
  };
  return new Promise((res) => ws.onopen = () => res({
    send(method, params = {}, sessionId) {
      const n = ++id;
      ws.send(JSON.stringify({ id: n, method, params, sessionId }));
      return new Promise((r, j) => pending.set(n, { res: r, rej: j }));
    },
    on(fn) { listeners.push(fn); },
    close() { ws.close(); }
  }));
}

async function testPage(cdp, page) {
  const errors = [];
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      errors.push("exception: " + (d.exception && d.exception.description || d.text));
    }
    if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "warning")) {
      errors.push("console." + msg.params.type + ": " + msg.params.args.map((a) => a.value || a.description).join(" "));
    }
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      errors.push("log: " + msg.params.entry.text + " " + (msg.params.entry.url || ""));
    }
  });
  await s("Runtime.enable");
  await s("Log.enable");
  await s("Page.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  const url = pathToFileURL(join(ROOT, page)).href;
  await s("Page.navigate", { url });
  await sleep(700);

  const evaluate = async (expr) => {
    const r = await s("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    return r.result.value;
  };

  // No horizontal scroll at phone width.
  await s("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 1, mobile: true });
  await sleep(250);
  const overflow = await evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
  if (overflow > 1) errors.push("horizontal scroll at 360px: " + overflow + "px");
  if (SHOTS) await shot(s, page, "mobile");
  await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(150);

  // Scenario: tests/scenarios/<tool>.js is evaluated in the page and must
  // resolve to "ok" or throw. It drives the real UI, not internal functions.
  const tool = page.split("/")[1] || "hub";
  const scenarioFile = join(SCENARIOS, tool + ".js");
  let scenario = "none";
  if (existsSync(scenarioFile)) {
    const helpers = readFileSync(join(SCENARIOS, "_helpers.js"), "utf8");
    try {
      const out = await evaluate("(async () => {" + helpers + "\n" + readFileSync(scenarioFile, "utf8") + "\n})()");
      scenario = out === "ok" ? "passed" : "returned " + JSON.stringify(out);
      if (out !== "ok") errors.push("scenario " + scenario);
    } catch (err) {
      scenario = "failed";
      errors.push("scenario: " + err.message.split("\n")[0]);
    }
    await sleep(300);
    // Overflow again with the scenario's data on screen: an empty state hides
    // most of the layouts that break at phone width.
    await s("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 1, mobile: true });
    await sleep(250);
    const loaded = await evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
    if (loaded > 1) errors.push("horizontal scroll at 360px after scenario: " + loaded + "px");
    await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    // Reload: state written by the scenario must survive and boot cleanly.
    await s("Page.reload", {});
    await sleep(600);
  }
  if (SHOTS) {
    await shot(s, page, "light");
    await evaluate("document.documentElement.setAttribute('data-theme','dark')");
    await sleep(150);
    await shot(s, page, "dark");
  }
  await cdp.send("Target.closeTarget", { targetId });
  return { page, scenario, errors };
}

async function shot(s, page, tag) {
  mkdirSync(SHOTS, { recursive: true });
  const { data } = await s("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(SHOTS, page.replace(/\//g, "_").replace(".html", "") + "-" + tag + ".png"), Buffer.from(data, "base64"));
}

const bin = findChrome();
if (!bin) {
  console.error("No Chrome found. Set CHROME=/path/to/chrome and run again.");
  process.exit(2);
}
const filters = process.argv.slice(2);
const pages = PAGES.filter((p) => !filters.length || filters.some((f) => p.includes(f)));
const { proc, wsUrl, profile } = await launch(bin);
const cdp = await connect(wsUrl);
let failed = 0;
for (const page of pages) {
  const r = await testPage(cdp, page);
  const ok = r.errors.length === 0;
  if (!ok) failed++;
  console.log((ok ? "PASS " : "FAIL ") + r.page + "  (scenario: " + r.scenario + ")");
  r.errors.forEach((e) => console.log("     " + e));
}
cdp.close();
proc.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* best effort */ }
console.log("\n" + (pages.length - failed) + "/" + pages.length + " pages clean");
process.exit(failed ? 1 : 0);
