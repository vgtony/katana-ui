// Dependency-free Chromium smoke checks against the production bundle and synthetic APIs.
// Run after npm run build: node tools/check-browser-workflows.mjs /path/to/chromium
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const browserPath = process.argv[2];
assert(browserPath, 'Pass a Chromium-compatible browser executable');
const root = resolve('dist/katana-slice-manager/browser');
const profile = await mkdtemp(join(tmpdir(), 'katana-browser-'));
const errors = [], results = [], requests = [];
let outage = false;
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path.startsWith('/api/')) {
    requests.push({ method: request.method, path });
    let body = [], status = 200;
    if (path === '/api/bootstrap/status') body = { status: 'never_run', nfvos: [], vims: [], links: [] };
    if (path === '/api/function') body = [{ id: 'healthy-function', name: 'Healthy function', password: 'secret-not-for-display' }];
    if (path === '/api/nfvo' && outage) { status = 503; body = { error: 'Simulated NFVO outage' }; }
    if (path === '/api/helm/charts') {
      if (request.headers.authorization !== 'Basic ' + Buffer.from('operator:test-secret').toString('base64')) {
        status = 401; body = { error: 'Invalid credentials' };
      } else body = { charts: [], max_bytes: 1048576 };
    }
    if (path === '/api/slice/local-slice') body = { _id: 'local-slice', slice_name: 'Local test', status: 'Running', ns_inst_info: {} };
    if (path.startsWith('/api/slice/local-slice/')) body = {};
    if (path.endsWith('/observability') && path.includes('local-slice')) body = { _id: 'local-slice', name: 'Local test', monitoring: { configured: false } };
    if (path.endsWith('/monitoring/summary')) body = { monitoring: { configured: false }, metrics: {} };
    if (request.method !== 'GET' && path !== '/api/helm/charts') { status = 400; body = { error: 'Synthetic environment: deployment unavailable' }; }
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
    return;
  }
  try {
    const file = path === '/' || !extname(path) ? 'index.html' : path.slice(1);
    const target = resolve(root, file);
    assert(target.startsWith(root + '/'));
    const data = await readFile(target);
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[extname(target)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type }); response.end(data);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', 'about:blank'], { stdio: 'ignore' });
let ws;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
  }
  assert(port, 'Browser did not start');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((done, reject) => { ws.onopen = done; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const call = (method, params = {}) => new Promise((done, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(key, { done, reject, timer }); ws.send(JSON.stringify({ id: key, method, params }));
  });
  ws.onmessage = ({ data }) => {
    const event = JSON.parse(data);
    if (event.id && pending.has(event.id)) {
      const task = pending.get(event.id); pending.delete(event.id); clearTimeout(task.timer);
      event.error ? task.reject(new Error(JSON.stringify(event.error))) : task.done(event.result);
    }
    if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);
  };
  await call('Page.enable'); await call('Runtime.enable');
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); }
    throw new Error(`Condition not met: ${expression}\n${await evaluate("document.body?.innerText")}\n${JSON.stringify(errors)}`);
  };
  const replaceDocument = async (method, params = {}) => {
    await evaluate(`document.documentElement.setAttribute('data-workflow-old', 'true')`);
    await call(method, params);
    await until(`document.body && !document.documentElement.hasAttribute('data-workflow-old')`);
  };
  const navigate = async (path, text) => {
    await replaceDocument('Page.navigate', { url: base + path });
    await until(`document.body?.innerText.includes(${JSON.stringify(text)})`);
    await delay(150);
  };
  const click = (text) => evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}))?.click()`);
  const setInput = (selector, value) => evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const routes = [['/', 'Katana Slice Manager'], ['/dashboard', 'Healthy function'], ['/infrastructure', 'NFVO and deployment target inventory'], ['/admin/infrastructure/bootstrap', 'Infrastructure bootstrap'], ['/helm-charts', 'Chart administrator sign in'], ['/deployment', 'Live targets'], ['/history', 'Deployment Packs'], ['/monitoring', 'Monitoring'], ['/monitoring/local-slice', 'Local test'], ['/slices/local-slice', 'Running']];
  for (const width of [1440, 390]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const [path, text] of routes) {
      await navigate(path, text);
      assert.equal(await evaluate(`document.querySelectorAll('nav .sidebar__link--active').length`), path.startsWith('/slices/') ? 0 : 1);
      assert.equal(await evaluate(`!![...document.querySelectorAll('nav a')].find(a => a.textContent.trim()==='Proxmox')`), false);
      assert.equal(await evaluate(`document.body?.innerText.includes('secret-not-for-display')`), false);
      const overflow = await evaluate('document.documentElement.scrollWidth > innerWidth + 2');
      results.push({ width, path, rendered: true, overflow });
    }
  }
  for (const path of ['/proxmox', '/does-not-exist']) { await navigate(path, 'Katana Slice Manager'); assert.equal(await evaluate('location.pathname'), '/'); }
  for (const path of ['/slices/create', '/deployment/slice']) { await navigate(path, 'Deploy'); assert.equal(await evaluate('location.pathname'), '/deployment/k8s'); }
  await navigate('/deployment', 'Live targets'); await click('New Deployment');
  await until(`document.body?.innerText.includes('Create New Network Slice')`);
  await click('Proxmox'); await until(`!!document.querySelector('input[type="password"]')`);
  assert.equal(await evaluate('location.pathname'), '/deployment/proxmox-standalone');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert(await evaluate(`document.activeElement !== document.body`));
  await replaceDocument('Page.reload'); await until(`!!document.querySelector('input[type="password"]')`);
  results.push({ workflow: 'New Deployment → Proxmox, keyboard focus and direct refresh', passed: true });
  outage = true;
  await navigate('/dashboard', 'Healthy function');
  await until(`document.body?.innerText.includes('Simulated NFVO outage')`);
  outage = false;
  results.push({ workflow: 'Dashboard retains healthy inventory during NFVO outage', passed: true });
  await navigate('/helm-charts', 'Chart administrator sign in');
  await setInput('#helm-username', 'operator'); await setInput('#helm-password', 'wrong'); await click('Sign in');
  await until(`document.body?.innerText.includes('Invalid credentials')`);
  await setInput('#helm-password', 'test-secret'); await click('Sign in');
  await until(`document.body?.innerText.includes('Upload a chart')`);
  assert.equal(await evaluate(`JSON.stringify(localStorage).includes('test-secret')`), false);
  await click('Sign out'); await until(`!!document.querySelector('#helm-password')`);
  assert.equal(await evaluate(`document.querySelector('#helm-password').value`), '');
  results.push({ workflow: 'Helm invalid/valid login, empty catalogue, sign-out and secret handling', passed: true });
  await navigate('/history', 'Deployment Packs');
  await evaluate(`localStorage.setItem('katana-slice-manager.deployment-history', '[null,{}]')`);
  await replaceDocument('Page.reload'); await until(`document.body?.innerText.includes('No deployment packs yet')`);
  const beforeClear = requests.filter((r) => r.method === 'DELETE').length;
  await click('Clear History'); assert.equal(requests.filter((r) => r.method === 'DELETE').length, beforeClear);
  results.push({ workflow: 'Corrupt history recovery; clear does not delete infrastructure', passed: true });
  await evaluate(`localStorage.setItem('katana-slice-manager.deployment-history', JSON.stringify([{ id:'accepted-pack', optionId:'k8s', optionLabel:'Kubernetes', status:'accepted', requirements:[], completedAt:'2026-10-16T09:00:00Z', osmResponse:{id:'osm-service-id'} }]))`);
  await replaceDocument('Page.reload'); await until(`document.body?.innerText.toLowerCase().includes('accepted — readiness not verified')`);
  await evaluate(`document.querySelector('details').open=true`);
  assert(await evaluate(`document.body?.innerText.includes('osm-service-id')`));
  results.push({ workflow: 'Accepted OSM result survives refresh and remains distinct from Katana slice status', passed: true });
  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile('/private/tmp/katana-browser-mobile.png', Buffer.from(screenshot.data, 'base64'));
  assert.deepEqual(errors, [], 'Unexpected browser exceptions');
  await writeFile('/private/tmp/katana-browser-results.json', JSON.stringify({ results, errors, requests }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  ws?.close(); browser.kill(); server.closeAllConnections(); server.close();
  await new Promise((done) => browser.exitCode !== null ? done() : browser.once('exit', done));
  await rm(profile, { recursive: true, force: true });
}
