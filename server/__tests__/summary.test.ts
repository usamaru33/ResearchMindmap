import { afterEach, describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { extractiveSummary, splitSentences } from '../core/summarize';
import { setLlmForTest } from '../llm/client';
import { FakeLlm } from '../llm/fake';
import { SUMMARY_SYSTEM } from '../llm/prompts';

afterEach(() => setLlmForTest(undefined));

const abstract =
  'Virtual reality lets users embody avatars of different sizes. In this paper we investigate how avatar size changes the perceived size of objects. We conducted an experiment with 24 participants (e.g. in a virtual room). Results show that larger avatars make objects look 12.5% smaller. However, the effect was only tested indoors.';
const paper = makePaper({ title: 'Avatar size and perceived object size', abstract, year: 2020 });

describe('extractive summary', () => {
  it('keeps abbreviations and decimals inside sentences', () => {
    const s = splitSentences(abstract);
    expect(s).toHaveLength(5);
    expect(s[2]).toContain('(e.g. in a virtual room)');
    expect(s[3]).toContain('12.5%');
  });

  it('labels aim, method, result and limitation sentences', () => {
    const out = extractiveSummary(paper);
    expect(out).toContain('**目的**: In this paper we investigate');
    expect(out).toContain('**手法**: We conducted an experiment');
    expect(out).toContain('**結果**: Results show');
    expect(out).toContain('**限界**: However');
  });

  it('handles missing abstracts', () => {
    expect(extractiveSummary(makePaper({ title: 't' }))).toMatch(/抄録がない/);
  });
});

async function sse(path: string, body: unknown) {
  const res = await createApp(loadConfig({})).request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.text();
}

describe('/api/llm/summarize', () => {
  it('falls back to the extractive summary without a key', async () => {
    setLlmForTest(null);
    const text = await sse('/api/llm/summarize', { paper });
    expect(text).toContain('event: done');
    expect(text).toContain('"mode":"fallback"');
    expect(text).toContain('目的');
  });

  it('streams the LLM summary with the paper fenced as data', async () => {
    const fake = new FakeLlm({ text: '- **目的**: サイズ知覚を調べた\n**一言で**: 体が大きいと物は小さく見える' });
    setLlmForTest(fake);
    const text = await sse('/api/llm/summarize', { paper, lang: 'ja' });
    expect(text).toContain('"mode":"llm"');
    expect(text.match(/event: delta/g)!.length).toBeGreaterThan(1);
    expect(fake.requests[0].system).toBe(SUMMARY_SYSTEM);
    expect(fake.requests[0].user).toContain('<paper>');
  });
});

describe('/api/llm/translate', () => {
  it('explains that translation needs a key', async () => {
    setLlmForTest(null);
    const text = await sse('/api/llm/translate', { paper });
    expect(text).toContain('event: error');
    expect(text).toContain('ANTHROPIC_API_KEY');
  });
});
