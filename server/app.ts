import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import type { HealthResponse } from '../shared/types';
import type { AppConfig } from './config';
import { createServices, type Services } from './services';
import { ApiHttpError } from './http/errors';
import { localOnly } from './http/security';
import { getLlm } from './llm/client';
import { exploreRoutes } from './routes/explore';
import { trendRoutes } from './routes/trends';
import { graphRoutes } from './routes/graph';
import { llmRoutes } from './routes/llm';
import { paperRoutes } from './routes/papers';
import { queryRoutes } from './routes/query';
import { resolveRoutes } from './routes/resolve';
import { searchRoutes } from './routes/search';
import { vagueRoutes } from './routes/vague';
import { sourceStatuses } from './sources/registry';

export const VERSION = '0.1.0';

function llmStatus(config: AppConfig): HealthResponse['llm'] {
  const llm = getLlm(config);
  return llm
    ? { enabled: true, model: llm.model }
    : { enabled: false, model: null, reason: 'ANTHROPIC_API_KEY が未設定（LLM なしの代替処理で動作）', reasonEn: 'ANTHROPIC_API_KEY is not set (features fall back to non-LLM processing)' };
}

export function createApp(config: AppConfig, services: Services = createServices(config)) {
  const app = new Hono();

  app.use('*', secureHeaders({ crossOriginResourcePolicy: 'same-origin' }));
  app.use('/api/*', localOnly({ allowedHosts: config.allowedHosts, allowedOrigins: config.allowedOrigins }));
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 8 * 1024 * 1024,
      onError: (c) => c.json({ error: { code: 'too_large', message: 'Request body is too large (8 MB max).' } }, 413),
    }),
  );

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
  app.route('/api/resolve', resolveRoutes(services));
  app.route('/api/llm', llmRoutes(services));
  app.route('/api/explore', exploreRoutes(services));
  app.route('/api/trends', trendRoutes(services));

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
    // Details stay in the server log; the response does not reveal internals.
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Internal server error' } }, 500);
  });

  return app;
}
