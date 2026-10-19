import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig, loadDotEnv } from './config';

loadDotEnv();
const config = loadConfig();
const app = createApp(config);

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`[api] listening on http://${config.host.includes(':') ? `[${config.host}]` : config.host}:${info.port}`);
  if (!['127.0.0.1', 'localhost', '::1'].includes(config.host)) {
    console.warn('[api] HOST is not loopback: anyone who can reach this port can use your API keys.');
  }
});
