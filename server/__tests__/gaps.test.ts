import { afterEach, describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import type { ClusterNamesResponse, GapsResponse } from '../../shared/types';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { cleanGaps, collectStatedGaps } from '../core/gaps';
import { LlmError, setLlmForTest } from '../llm/client';
import { FakeLlm } from '../llm/fake';
import { CLUSTER_NAMES_SYSTEM, GAPS_SYSTEM } from '../llm/prompts';

afterEach(() => setLlmForTest(undefined));

const papers = [
  makePaper({
    id: 'a',
    title: 'Avatar size and object size',
    abstract: 'We propose a size illusion. However, the effect was only tested with adults. Future work should study children.',
  }),
  makePaper({ id: 'b', title: 'Haptics', abstract: 'We built a glove. It works well.', challenges: 'Latency is high.' }),
  makePaper({ id: 'c', title: 'Nothing open', abstract: 'We present results. They are good.' }),
];
const groups = [
  { label: 'Body size', paperIds: ['a'] },
  { label: 'Haptics', paperIds: ['b'] },
];

describe('collectStatedGaps', () => {
  it('collects limitation and future-work sentences and user fields by cluster', () => {
    const gaps = collectStatedGaps(papers, groups);
    expect(gaps.map((g) => g.title)).toEqual(['Body size', 'Haptics']);
    expect(gaps[0].evidence.map((e) => e.quote)).toEqual([
      'However, the effect was only tested with adults.',
      'Future work should study children.',
    ]);
    expect(gaps[1].evidence).toEqual([{ paperId: 'b', quote: 'Latency is high.' }]);
  });
});

describe('cleanGaps', () => {
  it('drops unknown paper ids and empty gaps', () => {
    const out = cleanGaps(
      [
        { title: 'Kids', description: 'd', evidence: [{ paperId: 'a', quote: 'q' }, { paperId: 'zz', quote: 'x' }], paperIds: ['a', 'zz', 'a'], questions: ['Q?'] },
        { title: 'Ghost', description: 'd', evidence: [{ paperId: 'zz', quote: 'x' }], paperIds: ['zz'], questions: [] },
      ],
      papers,
    );
    expect(out).toEqual([{ title: 'Kids', description: 'd', evidence: [{ paperId: 'a', quote: 'q' }], paperIds: ['a'], questions: ['Q?'] }]);
  });
});

const post = (path: string, body: unknown) =>
  createApp(loadConfig({})).request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('/api/llm/gaps', () => {
  it('uses stated gaps without a key', async () => {
    setLlmForTest(null);
    const body = (await (await post('/api/llm/gaps', { papers, groups })).json()) as GapsResponse;
    expect(body.mode).toBe('fallback');
    expect(body.gaps).toHaveLength(2);
  });

  it('returns structured LLM gaps', async () => {
    const fake = new FakeLlm({
      respond: (req) =>
        req.system === GAPS_SYSTEM
          ? { gaps: [{ title: '子どもへの適用', description: '成人のみ', evidence: [{ paperId: 'a', quote: 'only tested with adults' }], paperIds: ['a'], questions: ['子どもでも錯覚は起きるか？'] }] }
          : null,
    });
    setLlmForTest(fake);
    const body = (await (await post('/api/llm/gaps', { papers, groups, topic: 'VR' })).json()) as GapsResponse;
    expect(body.mode).toBe('llm');
    expect(body.gaps[0].questions).toEqual(['子どもでも錯覚は起きるか？']);
    expect(fake.requests[0].user).toContain('Stated challenges: Latency is high.');
  });

  it('falls back when the LLM fails', async () => {
    setLlmForTest(new FakeLlm({ respond: () => new LlmError('rate_limited', '回数制限') }));
    const body = (await (await post('/api/llm/gaps', { papers, groups })).json()) as GapsResponse;
    expect(body.mode).toBe('fallback');
    expect(body.warnings[0]).toMatch(/回数制限/);
  });
});

describe('/api/llm/cluster-names', () => {
  const clusters = [
    { id: 'c1', label: 'Free Will and Agency', titles: ['Agency in VR', 'Sense of agency with avatars'] },
    { id: 'c2', label: 'Other', titles: ['x'] },
  ];

  it('keeps names without a key', async () => {
    setLlmForTest(null);
    expect(await (await post('/api/llm/cluster-names', { clusters })).json()).toEqual({ mode: 'fallback', names: {} });
  });

  it('returns names only for known clusters', async () => {
    setLlmForTest(
      new FakeLlm({
        respond: (req) =>
          req.system === CLUSTER_NAMES_SYSTEM ? { names: [{ id: 'c1', name: 'アバターと主体感' }, { id: 'zz', name: 'nope' }] } : null,
      }),
    );
    const body = (await (await post('/api/llm/cluster-names', { clusters })).json()) as ClusterNamesResponse;
    expect(body).toEqual({ mode: 'llm', names: { c1: 'アバターと主体感' } });
  });

  it('reports LLM failures as 502', async () => {
    setLlmForTest(new FakeLlm({ respond: () => new LlmError('auth', 'bad key') }));
    expect((await post('/api/llm/cluster-names', { clusters })).status).toBe(502);
  });
});
