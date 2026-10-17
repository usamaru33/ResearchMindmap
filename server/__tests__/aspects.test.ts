import { afterEach, describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import type { AspectFillResponse } from '../../shared/types';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { canFillWithoutLlm, fillByCue } from '../core/aspects';
import { setLlmForTest } from '../llm/client';
import { FakeLlm } from '../llm/fake';
import { ASPECT_SYSTEM } from '../llm/prompts';

afterEach(() => setLlmForTest(undefined));

const papers = [
  makePaper({ id: 'a', title: 'A', abstract: 'Bodies matter. We propose a new avatar model. Results show a 10% gain.' }),
  makePaper({ id: 'b', title: 'B', abstract: 'Nothing about methods here.' }),
];

describe('fillByCue', () => {
  it('knows common aspect names in both languages', () => {
    expect(canFillWithoutLlm('手法')).toBe(true);
    expect(canFillWithoutLlm('Results')).toBe(true);
    expect(canFillWithoutLlm('Sample size')).toBe(false);
  });

  it('takes the first sentence with the aspect cue', () => {
    expect(fillByCue('Method', papers)).toEqual({ a: 'We propose a new avatar model.', b: '' });
    expect(fillByCue('結果', papers).a).toBe('Results show a 10% gain.');
  });
});

describe('/api/llm/fill-aspect', () => {
  const post = (body: unknown) =>
    createApp(loadConfig({})).request('/api/llm/fill-aspect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('fills known aspects without a key and refuses others', async () => {
    setLlmForTest(null);
    const ok = (await (await post({ aspect: '手法', papers })).json()) as AspectFillResponse;
    expect(ok).toEqual({ mode: 'fallback', values: { a: 'We propose a new avatar model.', b: '' } });
    const res = await post({ aspect: 'Sample size', papers });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'needs_llm' } });
  });

  it('uses the LLM and keeps only known ids', async () => {
    setLlmForTest(
      new FakeLlm({ respond: (req) => (req.system === ASPECT_SYSTEM ? { values: [{ id: 'a', value: ' 24 participants ' }, { id: 'x', value: 'no' }] } : null) }),
    );
    const body = (await (await post({ aspect: 'Sample size', papers })).json()) as AspectFillResponse;
    expect(body).toEqual({ mode: 'llm', values: { a: '24 participants' } });
  });
});
