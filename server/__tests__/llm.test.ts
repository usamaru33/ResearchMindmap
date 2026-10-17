import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import type { HealthResponse } from '../../shared/types';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { streamText } from '../http/sse';
import { AnthropicBackend, LlmError, getLlm, setLlmForTest } from '../llm/client';
import { FakeLlm } from '../llm/fake';

afterEach(() => setLlmForTest(undefined));

describe('getLlm', () => {
  it('is null without an API key and an Anthropic backend with one', () => {
    expect(getLlm(loadConfig({}))).toBeNull();
    const llm = getLlm(loadConfig({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-opus-5-5' }));
    expect(llm).toBeInstanceOf(AnthropicBackend);
    expect(llm?.model).toBe('claude-opus-5-5');
  });

  it('can be overridden for tests', async () => {
    setLlmForTest(new FakeLlm());
    const llm = getLlm(loadConfig({}));
    expect(llm?.model).toBe('fake-model');
    const body = (await (await createApp(loadConfig({})).request('/api/health')).json()) as HealthResponse;
    expect(body.llm).toEqual({ enabled: true, model: 'fake-model' });
  });
});

describe('FakeLlm', () => {
  it('validates structured answers against the schema', async () => {
    const schema = z.object({ queries: z.array(z.string()) });
    const ok = new FakeLlm({ respond: () => ({ queries: ['a'] }) });
    expect(await ok.structured({ system: '', user: '', effort: 'low', schema })).toEqual({ queries: ['a'] });
    const bad = new FakeLlm({ respond: () => ({ queries: 'nope' }) });
    expect(await bad.structured({ system: '', user: '', effort: 'low', schema })).toBeNull();
  });
});

describe('streamText (SSE)', () => {
  function app(work: Parameters<typeof streamText>[1]) {
    return new Hono().get('/s', (c) => streamText(c, work));
  }

  it('relays deltas and a final done event', async () => {
    const llm = new FakeLlm({ text: 'Hello, related work section.' });
    const res = await app(async (events) => ({ text: await llm.streamText({ system: '', user: '', effort: 'low' }, events.delta), meta: { mode: 'llm' } })).request('/s');
    const body = await res.text();
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(body.match(/event: delta/g)?.length).toBeGreaterThan(1);
    expect(body).toContain('event: done');
    expect(body).toContain('"mode":"llm"');
  });

  it('turns failures into an error event', async () => {
    const res = await app(async () => {
      throw new LlmError('refusal', 'declined');
    }).request('/s');
    const body = await res.text();
    expect(body).toContain('event: error');
    expect(body).toContain('"code":"refusal"');
  });
});
