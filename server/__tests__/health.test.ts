import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import type { HealthResponse } from '../../shared/types';

describe('GET /api/health', () => {
  it('reports LLM disabled when no API key is configured', async () => {
    const app = createApp(loadConfig({}));
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body.ok).toBe(true);
    expect(body.llm.enabled).toBe(false);
  });

  it('reports LLM enabled with the configured model', async () => {
    const app = createApp(loadConfig({ ANTHROPIC_API_KEY: 'test', ANTHROPIC_MODEL: 'm' }));
    const body = (await (await app.request('/api/health')).json()) as HealthResponse;
    expect(body.llm).toEqual({ enabled: true, model: 'm' });
  });

  it('returns JSON 404 for unknown routes', async () => {
    const app = createApp(loadConfig({}));
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});
