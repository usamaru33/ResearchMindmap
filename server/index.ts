import { serve } from '@hono/node-server';
import { createApp } from './app';
import { hasBuiltApp } from './http/static';
import { loadConfig, loadDotEnv } from './config';

loadDotEnv();
const config = loadConfig();
// `npm run dev` serves the app through Vite; a leftover build must not be served here.
if (process.argv.includes('--api-only')) config.staticDir = '';
const app = createApp(config);

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`[api] listening on http://${config.host.includes(':') ? `[${config.host}]` : config.host}:${info.port}`);
  if (hasBuiltApp(config.staticDir)) console.log(`[app] open http://localhost:${info.port} in your browser`);
  if (!['127.0.0.1', 'localhost', '::1'].includes(config.host)) {
    console.warn('[api] HOST is not loopback: anyone who can reach this port can use your API keys.');
  }
});
