import { afterEach, describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { normalizeGroups, papersBlock, templateDraft } from '../core/relatedWork';
import { setLlmForTest } from '../llm/client';
import { FakeLlm } from '../llm/fake';

afterEach(() => setLlmForTest(undefined));

const papers = [
  makePaper({ id: 'a', title: 'Owning a Bigger Body', authors: ['Ana Lopez', 'Bo Chen'], year: 2019, abstract: 'We study body size illusions. More text.' }),
  makePaper({ id: 'b', title: 'Hands and Objects', authors: ['Kim Lee'], year: 2016, abstract: 'Hand size changes object size. Second.' }),
  makePaper({ id: 'c', title: 'Presence Questionnaires', authors: ['X Y', 'Z W', 'Q R'], year: 2021, abstract: '' }),
];
const groups = [
  { label: 'Body size illusions', paperIds: ['a', 'b', 'zz'] },
  { label: 'Duplicate', paperIds: ['a'] },
];

describe('related work helpers', () => {
  it('normalizes groups: drop unknown and repeated ids, add Other', () => {
    expect(normalizeGroups(papers, groups)).toEqual([
      { label: 'Body size illusions', paperIds: ['a', 'b'] },
      { label: 'Other', paperIds: ['c'] },
    ]);
  });

  it('lists papers with citation keys for the prompt', () => {
    const { text, keys } = papersBlock({ papers, groups, topic: '', lang: 'ja' });
    expect(keys.get('a')).toBe('lopez2019owning');
    expect(text).toContain('## Body size illusions');
    expect(text).toContain('[lopez2019owning] Lopez and Chen (2019). Owning a Bigger Body.');
    expect(text).toContain('[y2021presence] Y et al. (2021)');
  });

  it('builds a template draft ordered by year within each group', () => {
    const draft = templateDraft({ papers, groups, topic: 'VR body size', lang: 'ja' });
    expect(draft).toContain('## 関連研究');
    expect(draft).toContain('本研究（VR body size）');
    const iB = draft.indexOf('[lee2016hands]');
    const iA = draft.indexOf('[lopez2019owning]');
    expect(iB).toBeGreaterThan(0);
    expect(iB).toBeLessThan(iA);
    expect(draft).toContain('- Lee [lee2016hands] (2016): Hand size changes object size.');
  });
});

describe('/api/llm/related-work', () => {
  const post = (body: unknown) =>
    createApp(loadConfig({})).request('/api/llm/related-work', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('returns the template without a key', async () => {
    setLlmForTest(null);
    const text = await (await post({ papers, groups, topic: 't' })).text();
    expect(text).toContain('"mode":"fallback"');
    expect(text).toContain('関連研究');
  });

  it('puts the paper list in a cacheable system prompt', async () => {
    const fake = new FakeLlm({ text: '### Body size\nPrior work [lopez2019owning] ...' });
    setLlmForTest(fake);
    const text = await (await post({ papers, groups, topic: 'VR', lang: 'en' })).text();
    expect(text).toContain('"mode":"llm"');
    const req = fake.requests[0];
    expect(req.cacheSystem).toBe(true);
    expect(req.effort).toBe('high');
    expect(req.system).toContain('<papers>');
    expect(req.system).toContain('[lopez2019owning]');
    expect(req.user).toContain('Language: English');
  });

  it('rejects an empty selection', async () => {
    expect((await post({ papers: [] })).status).toBe(400);
  });
});
