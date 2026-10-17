import { Hono } from 'hono';
import type { HealthResponse } from '../shared/types';
import type { AppConfig } from './config';

export const VERSION = '0.1.0';

export function createApp(config: AppConfig) {
  const app = new Hono();

  app.get('/api/health', (c) => {
    const body: HealthResponse = {
      ok: true,
      version: VERSION,
      sources: [],
      llm: config.anthropicApiKey
        ? { enabled: true, model: config.anthropicModel }
        : { enabled: false, model: null, reason: 'ANTHROPIC_API_KEY が未設定' },
    };
    return c.json(body);
  });

  app.notFound((c) =>
    c.json({ error: { code: 'not_found', message: `No route for ${c.req.path}` } }, 404),
  );

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: { code: 'internal', message: err.message } }, 500);
  });

  return app;
}
