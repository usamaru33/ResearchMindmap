import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import type { GraphBuildResponse, Paper, Topic } from '../../shared/types';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { clusterPapers, clusteringScore, facetClusters, linkCitations } from '../core/graph';
import { HttpClient } from '../infra/http';
import { createServices } from '../services';

const topic = (id: string, name: string, subfield = 'SF1', field = 'F1'): Topic[] => [
  { id, name, level: 'topic' },
  { id: subfield, name: `Subfield ${subfield}`, level: 'subfield' },
  { id: field, name: `Field ${field}`, level: 'field' },
];

const paper = (id: string, extra: Partial<Paper> = {}) => makePaper({ id, title: `Paper ${id}`, year: 2020, ...extra });

describe('linkCitations', () => {
  it('links papers that cite each other via OpenAlex ids', () => {
    const papers = [
      paper('a', { ids: { openalex: 'W1' } }),
      paper('b', { ids: { openalex: 'W2' }, referenceIds: ['W1', 'W999'] }),
      paper('c', { ids: { openalex: 'W3' }, referenceIds: ['W1', 'W2', 'W3'] }),
    ];
    const { papers: out, links } = linkCitations(papers);
    expect(out.find((p) => p.id === 'b')?.references).toEqual(['a']);
    expect(out.find((p) => p.id === 'c')?.references).toEqual(['a', 'b']);
    expect(links).toEqual([
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'b', target: 'c' },
    ]);
  });

  it('keeps existing references', () => {
    const { papers } = linkCitations([paper('a'), paper('b', { references: ['a'] })]);
    expect(papers[1].references).toEqual(['a']);
  });
});

describe('clusterPapers', () => {
  it('groups by topic when that gives a readable number of groups', () => {
    const papers = [
      paper('1', { topics: topic('T1', 'Embodiment') }),
      paper('2', { topics: topic('T1', 'Embodiment') }),
      paper('3', { topics: topic('T2', 'Haptics') }),
      paper('4', { topics: topic('T2', 'Haptics') }),
      paper('5', { topics: topic('T3', 'Lonely') }),
      paper('6'),
    ];
    const clusters = clusterPapers(papers);
    expect(clusters.map((c) => [c.label, c.paperIds])).toEqual([
      ['Embodiment', ['1', '2']],
      ['Haptics', ['3', '4']],
      ['Other', ['5', '6']],
    ]);
    expect(clusters[0]).toMatchObject({ id: 'topic:T1', level: 'topic' });
  });

  it('moves up to subfields when topics are too fragmented', () => {
    const papers = Array.from({ length: 12 }, (_, i) =>
      paper(String(i), { topics: topic(`T${i}`, `Topic ${i}`, i < 6 ? 'SF-A' : 'SF-B') }),
    );
    const clusters = clusterPapers(papers, { maxClusters: 8 });
    expect(clusters.map((c) => c.label)).toEqual(['Subfield SF-A', 'Subfield SF-B']);
    expect(clusters[0].level).toBe('subfield');
  });

  it('caps the number of clusters and folds the rest into Other', () => {
    const papers = Array.from({ length: 20 }, (_, i) =>
      paper(String(i), { topics: topic(`T${i % 10}`, `Topic ${i % 10}`, `SF${i % 10}`, `F${i % 10}`) }),
    );
    const clusters = clusterPapers(papers, { maxClusters: 4 });
    expect(clusters).toHaveLength(4);
    expect(clusters[3].label).toBe('Other');
    expect(clusters.reduce((n, c) => n + c.paperIds.length, 0)).toBe(20);
  });

  it('puts everything in one group when no topics are known', () => {
    expect(clusterPapers([paper('a'), paper('b')])).toEqual([
      { id: 'other', label: 'Papers', level: 'topic', paperIds: ['a', 'b'] },
    ]);
  });
});

describe('facetClusters', () => {
  // 20 VR papers: "virtual reality" is on all of them, so it must not become a cluster.
  const vr = (i: number, kws: string[]) =>
    paper(String(i), { keywords: ['Virtual reality', ...kws], topics: topic('T1', 'Virtual Reality Applications') });
  const papers = [
    ...Array.from({ length: 8 }, (_, i) => vr(i, ['Avatar', 'Embodiment'])),
    ...Array.from({ length: 6 }, (_, i) => vr(10 + i, ['Rehabilitation'])),
    ...Array.from({ length: 4 }, (_, i) => vr(20 + i, ['Presence'])),
    vr(30, ['Haptics']),
    vr(31, []),
  ];

  it('splits a set that shares one dominant topic by its other facets', () => {
    const clusters = facetClusters(papers);
    expect(clusters.map((c) => [c.label, c.paperIds.length])).toEqual([
      ['Avatar', 8],
      ['Rehabilitation', 6],
      ['Presence', 4],
      ['Other', 2],
    ]);
    expect(clusters[0]).toMatchObject({ id: 'keyword:avatar', level: 'keyword' });
  });

  it('is preferred over a single giant topic cluster', () => {
    const chosen = clusterPapers(papers);
    expect(chosen[0].level).toBe('keyword');
    expect(clusteringScore(chosen, papers.length)).toBeGreaterThan(0.5);
  });

  it('skips arXiv category codes and capitalizes labels', () => {
    const set = Array.from({ length: 6 }, (_, i) => paper(String(i), { keywords: i < 3 ? ['cs.HC', 'haptics'] : ['cs.HC', 'presence'] }));
    expect(facetClusters(set).map((c) => c.label)).toEqual(['Haptics', 'Presence']);
  });

  it('ignores generic one-word facets', () => {
    const set = Array.from({ length: 6 }, (_, i) => paper(String(i), { keywords: ['Change', i < 3 ? 'haptics' : 'presence'] }));
    expect(facetClusters(set).map((c) => c.label)).toEqual(['Haptics', 'Presence']);
  });

  it('can be forced either way', () => {
    expect(clusterPapers(papers, { level: 'topic' })[0].label).toBe('Virtual Reality Applications');
    expect(clusterPapers(papers, { level: 'keyword' })[0].label).toBe('Avatar');
  });
});

describe('POST /api/graph/build', () => {
  it('returns linked papers and clusters', async () => {
    const config = loadConfig({});
    const offline = (async () => {
      throw new Error('no network');
    }) as typeof fetch;
    const services = createServices(config, { http: new HttpClient({ log: () => {}, fetch: offline }) });
    const app = createApp(config, services);
    // Papers that already have everything, so enrichment makes no calls.
    const papers = [
      paper('a', { ids: { openalex: 'W1' }, abstract: 'x', topics: topic('T1', 'Embodiment') }),
      paper('b', { ids: { openalex: 'W2' }, abstract: 'x', topics: topic('T1', 'Embodiment'), referenceIds: ['W1'] }),
    ];
    const res = await app.request('/api/graph/build', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ papers }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as GraphBuildResponse;
    expect(body.citationLinks).toEqual([{ source: 'a', target: 'b' }]);
    expect(body.clusters[0]).toMatchObject({ label: 'Embodiment', paperIds: ['a', 'b'] });
    expect(body.warnings).toEqual([]);
  });
});
