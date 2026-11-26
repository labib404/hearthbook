// Takes the README / dossier screenshots: real renders of app/ in headless Chrome, one per entry of shots.json,
// driven over the Chrome DevTools Protocol with Node's own fetch and WebSocket (nothing to install).
//
//   node tools/screenshots.mjs [path-to-chrome]
//
// Each shot gets a fresh browser context (empty storage), so the app opens on its sample household exactly as a
// first visitor sees it, at the exact viewport in shots.json (a phone size is emulated as a touch device).
// A PNG over the 256 KiB the make.fun gate allows is captured again as a JPEG.

import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const chrome = process.argv[2] || process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE_PORT = 8091;
const CDP_PORT = 9339;
const MAX_BYTES = 250 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8'));
const outDir = join(repo, 'screenshots');
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) rmSync(join(outDir, f));

const server = spawn(process.execPath, ['serve.ts', '--port', String(SITE_PORT)], { cwd: repo, stdio: 'ignore' });
const profile = join(tmpdir(), `hearthbook-cdp-${Date.now()}`);
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

/** A tiny CDP client: send(method, params, sessionId) resolves with the result; on(event) waits for one event. */
async function connect() {
  let info;
  for (let i = 0; i < 50 && !info; i++) {
    try { info = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(); } catch { await sleep(200); }
  }
  if (!info) throw new Error('Chrome did not open its debugging port');
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) {
      const i = waiters.findIndex((w) => w.method === msg.method && w.sessionId === msg.sessionId);
      if (i >= 0) waiters.splice(i, 1)[0].res(msg.params);
    }
  };
  return {
    send: (method, params = {}, sessionId) => new Promise((res, rej) => {
      const msgId = ++id;
      pending.set(msgId, { res, rej });
      ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
    }),
    on: (method, sessionId) => new Promise((res) => waiters.push({ method, sessionId, res })),
    close: () => ws.close(),
  };
}

async function shoot(cdp, shot) {
  const { browserContextId } = await cdp.send('Target.createBrowserContext');
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const { width, height } = shot.viewport;
  const mobile = width < 600;
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }, sessionId);
  if (mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: shot.dark ? 'dark' : 'light' }] }, sessionId);
  const loaded = cdp.on('Page.loadEventFired', sessionId);
  await cdp.send('Page.navigate', { url: `http://localhost:${SITE_PORT}/${shot.path}` }, sessionId);
  await loaded;
  await sleep(1500); // the first visit builds the sample household and loads the page module
  let { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  let file = shot.file;
  if (Buffer.byteLength(data, 'base64') > MAX_BYTES) {
    ({ data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 86 }, sessionId));
    file = file.replace(/\.png$/i, '.jpg');
  }
  writeFileSync(join(outDir, file), Buffer.from(data, 'base64'));
  await cdp.send('Target.disposeBrowserContext', { browserContextId });
  console.log(`${file.padEnd(24)} ${width}x${height}  ${Buffer.byteLength(data, 'base64').toLocaleString()} bytes`);
}

try {
  await sleep(800);
  const cdp = await connect();
  for (const shot of shots) await shoot(cdp, shot);
  cdp.close();
} finally {
  browser.kill();
  server.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
