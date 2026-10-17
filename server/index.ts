import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig, loadDotEnv } from './config';

loadDotEnv();
const config = loadConfig();
const app = createApp(config);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});
