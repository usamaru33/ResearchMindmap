import { Hono } from 'hono';
import type { HealthResponse } from '../shared/types';
import type { AppConfig } from './config';
import { createServices, type Services } from './services';
import { ApiHttpError } from './http/errors';
import { getLlm } from './llm/client';
import { graphRoutes } from './routes/graph';
import { paperRoutes } from './routes/papers';
import { queryRoutes } from './routes/query';
import { searchRoutes } from './routes/search';
import { vagueRoutes } from './routes/vague';
import { sourceStatuses } from './sources/registry';

export const VERSION = '0.1.0';

function llmStatus(config: AppConfig): HealthResponse['llm'] {
  const llm = getLlm(config);
  return llm
    ? { enabled: true, model: llm.model }
    : { enabled: false, model: null, reason: 'ANTHROPIC_API_KEY が未設定（LLM なしの代替処理で動作）' };
}

export function createApp(config: AppConfig, services: Services = createServices(config)) {
  const app = new Hono();

  app.get('/api/health', (c) => {
    const body: HealthResponse = {
      ok: true,
      version: VERSION,
      sources: sourceStatuses(config),
      llm: llmStatus(config),
    };
    return c.json(body);
  });

  app.route('/api/query', queryRoutes);
  app.route('/api/search', searchRoutes(services));
  app.route('/api/graph', graphRoutes(services));
  app.route('/api/vague-search', vagueRoutes(services));
  app.route('/api/papers', paperRoutes(services));

  app.notFound((c) =>
    c.json({ error: { code: 'not_found', message: `No route for ${c.req.path}` } }, 404),
  );

  app.onError((err, c) => {
    if (err instanceof ApiHttpError) {
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        err.status,
      );
    }
    console.error(err);
    return c.json({ error: { code: 'internal', message: err.message } }, 500);
  });

  return app;
}
