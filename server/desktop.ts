// Desktop app entry (DESIGN 15.3): one executable that serves the embedded build
// and the API on this machine only, then opens the user's browser.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createAdaptorServer } from '@hono/node-server';
import { VERSION, createApp } from './app';
import { loadConfig, loadDotEnv } from './config';
import { contentTypeFor, type EmbeddedFiles } from './http/static';

const APP_DIR = 'ResearchMindmap';

/** Per-user folders that only this Windows account can read (%APPDATA%, %LOCALAPPDATA%). */
function userDirs(): { config: string; cache: string } {
  const roaming = process.env.APPDATA ?? join(homedir(), '.config');
  const local = process.env.LOCALAPPDATA ?? join(homedir(), '.cache');
  return { config: join(roaming, APP_DIR), cache: join(local, APP_DIR, 'cache') };
}

async function loadEmbeddedApp(): Promise<{ files: EmbeddedFiles; envExample: string }> {
  const sea = await import('node:sea');
  if (!sea.isSea()) throw new Error('Run the packaged executable (npm run build:exe), or use `npm start` instead.');
  const asText = (key: string) => new TextDecoder().decode(sea.getRawAsset(key) as ArrayBuffer);
  const paths = JSON.parse(asText('manifest.json')) as string[];
  const files: EmbeddedFiles = new Map();
  for (const path of paths) {
    files.set(path, { body: new Uint8Array(sea.getRawAsset(`app${path}`) as ArrayBuffer), type: contentTypeFor(path) });
  }
  return { files, envExample: asText('env.example') };
}

/** Open the URL in the default browser without going through a shell. */
function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32' ? ['explorer.exe', [url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => console.log(`[app] could not open a browser; open the link above yourself.`));
  child.unref();
}

/** Keep the console window open so a double-clicked app can show why it stopped. */
function fail(message: string): void {
  console.error(`\n[app] ${message}`);
  if (!process.stdin.isTTY) process.exit(1);
  console.error('Press Enter to close. / Enter キーで閉じます。');
  process.stdin.once('data', () => process.exit(1));
}

async function main(): Promise<void> {
  const dirs = userDirs();
  mkdirSync(dirs.config, { recursive: true });
  const envPath = join(dirs.config, '.env');
  const { files, envExample } = await loadEmbeddedApp();
  try {
    // First run: a settings file to fill in. Never overwrite the user's one.
    writeFileSync(envPath, envExample, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
  loadDotEnv(envPath);

  const config = loadConfig({ ...process.env, CACHE_DIR: process.env.CACHE_DIR ?? dirs.cache });
  // The desktop app is for this machine only: .env cannot widen it (use `npm start` or Docker for that).
  config.host = '127.0.0.1';
  config.allowedHosts = [];
  config.allowedOrigins = [];
  const token = randomBytes(32).toString('hex');

  let handler: ((req: Request) => Response | Promise<Response>) | null = null;
  const server = createAdaptorServer({ fetch: (req: Request) => handler!(req) });
  const listen = (port: number) => server.listen(port, config.host);
  server.on('error', (err: NodeJS.ErrnoException) => {
    // Another copy (or another program) has the port: take any free one.
    if (err.code === 'EADDRINUSE' && config.port !== 0) {
      console.log(`[app] port ${config.port} is in use; picking another one.`);
      config.port = 0;
      listen(0);
      return;
    }
    fail(err.message);
  });
  server.on('listening', () => {
    config.port = (server.address() as AddressInfo).port;
    handler = createApp(config, undefined, { launchToken: token, embeddedApp: files }).fetch;
    const url = `http://127.0.0.1:${config.port}/?launch=${token}`;
    console.log(`Research Mind Map ${VERSION}`);
    console.log(`[app] settings (API keys): ${envPath}`);
    console.log(`[app] opening ${url}`);
    console.log('[app] keep this window open while you use the app; close it to stop.');
    if (!process.argv.includes('--no-browser')) openBrowser(url);
  });
  listen(config.port);
}

main().catch((err: Error) => fail(err.message));
