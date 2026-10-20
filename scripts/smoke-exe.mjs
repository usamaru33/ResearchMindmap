// Start the built desktop app (release/ResearchMindmap.exe) with throwaway user
// folders and check that it serves the app and guards the API (DESIGN 15.3).
// No external API is called.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const exe = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'release', 'ResearchMindmap.exe'));
const home = mkdtempSync(join(tmpdir(), 'rmm-smoke-'));
const env = { ...process.env, APPDATA: join(home, 'roaming'), LOCALAPPDATA: join(home, 'local') };
delete env.NODE_OPTIONS;
// Fake keys: none of them may show up in a response.
const secret = `smoke-${randomBytes(12).toString('hex')}`;
for (const name of ['OPENALEX_API_KEY', 'SEMANTIC_SCHOLAR_API_KEY', 'IEEE_API_KEY', 'NCBI_API_KEY', 'ANTHROPIC_API_KEY']) env[name] = secret;

const child = spawn(exe, ['--no-browser'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
let output = '';
const launchUrl = await new Promise((done, failed) => {
  const timer = setTimeout(() => failed(new Error(`no launch URL within 30s:\n${output}`)), 30_000);
  child.stdout.on('data', (chunk) => {
    output += chunk;
    const m = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?launch=[0-9a-f]{64}/);
    if (m) {
      clearTimeout(timer);
      done(new URL(m[0]));
    }
  });
  child.on('exit', (code) => failed(new Error(`exited with ${code}:\n${output}`)));
});

/** fetch() ignores a Host header, so send this one with node:http. */
function statusWithHost(url, host, cookie) {
  return new Promise((done, failed) => {
    request(url, { headers: { host, cookie } }, (res) => {
      res.resume();
      done(res.statusCode);
    }).on('error', failed).end();
  });
}

let failures = 0;
function check(name, ok) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failures++;
}

try {
  const base = launchUrl.origin;
  const health = `${base}/api/health`;
  check('API without the launch cookie → 401', (await fetch(health)).status === 401);
  check('wrong launch token → 403', (await fetch(`${base}/?launch=${'0'.repeat(64)}`, { redirect: 'manual' })).status === 403);

  const launch = await fetch(launchUrl, { redirect: 'manual' });
  const setCookie = launch.headers.get('set-cookie') ?? '';
  check('launch link → 303 to /', launch.status === 303 && launch.headers.get('location') === '/');
  check('session cookie is HttpOnly and SameSite=Strict', /HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie));
  const cookie = setCookie.split(';')[0];

  const ok = await fetch(health, { headers: { cookie } });
  const body = await ok.json();
  check('API with the cookie → 200', ok.status === 200 && body.ok === true);
  check('API keys stay out of /api/health', !JSON.stringify(body).includes(secret));
  check('other Host header → 403', (await statusWithHost(health, 'evil.example', cookie)) === 403);
  check('other Origin → 403', (await fetch(health, { headers: { cookie, origin: 'https://evil.example' } })).status === 403);

  const page = await fetch(base, { headers: { cookie } });
  const html = await page.text();
  check('serves the app', page.status === 200 && html.includes('id="root"'));
  check('with a content security policy', (page.headers.get('content-security-policy') ?? '').startsWith("default-src 'self'"));
  check('with nosniff', page.headers.get('x-content-type-options') === 'nosniff');
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  const js = script ? await fetch(`${base}${script}`) : null;
  check('serves the embedded scripts', js?.status === 200 && (js.headers.get('content-type') ?? '').includes('javascript'));
  check('wrote the settings template to %APPDATA%', existsSync(join(env.APPDATA, 'ResearchMindmap', '.env')));
  check('listens on 127.0.0.1 only', launchUrl.hostname === '127.0.0.1');
} finally {
  child.kill();
  rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('desktop app smoke test passed');
