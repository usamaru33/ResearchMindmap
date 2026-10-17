import type { Cluster, Paper, Topic } from '../../shared/types';

export interface CitationLink {
  /** The cited (older) paper. */
  source: string;
  /** The citing paper. */
  target: string;
}

/**
 * Connect papers in the set that cite each other, using OpenAlex reference
 * lists. Returns papers whose `references` include the in-set papers they cite.
 */
export function linkCitations(papers: Paper[]): { papers: Paper[]; links: CitationLink[] } {
  const byOpenAlex = new Map<string, string>();
  for (const p of papers) if (p.ids?.openalex) byOpenAlex.set(p.ids.openalex, p.id);
  const links: CitationLink[] = [];
  const linked = papers.map((p) => {
    const cited = new Set(p.references);
    for (const ref of p.referenceIds ?? []) {
      const target = byOpenAlex.get(ref);
      if (target && target !== p.id) cited.add(target);
    }
    for (const c of cited) links.push({ source: c, target: p.id });
    return cited.size === p.references.length ? p : { ...p, references: [...cited] };
  });
  return { papers: linked, links };
}

export type ClusterLevel = Topic['level'];
const LEVELS: ClusterLevel[] = ['topic', 'subfield', 'field', 'domain'];

function topicAt(p: Paper, level: ClusterLevel): Topic | undefined {
  // topics[0] is the primary topic; subfield/field/domain entries describe it.
  if (level === 'topic') return p.topics?.find((t) => t.level === 'topic');
  return p.topics?.find((t) => t.level === level);
}

export interface ClusterOptions {
  level?: ClusterLevel | 'keyword' | 'auto';
  maxClusters?: number;
  minClusterSize?: number;
}

function finish(groups: Array<{ id: string; label: string; ids: string[] }>, level: Cluster['level'], papers: Paper[]): Cluster[] {
  const keptIds = new Set(groups.flatMap((g) => g.ids));
  const other = papers.map((p) => p.id).filter((id) => !keptIds.has(id));
  const clusters: Cluster[] = groups.map((g) => ({ id: g.id, label: g.label, level, paperIds: g.ids }));
  if (other.length) clusters.push({ id: 'other', label: clusters.length ? 'Other' : 'Papers', level, paperIds: other });
  return clusters;
}

/**
 * Group papers by OpenAlex topic, choosing the finest level that yields a
 * readable number of groups. Small groups fold into "Other".
 */
export function topicClusters(papers: Paper[], opts: ClusterOptions = {}): Cluster[] {
  const maxClusters = opts.maxClusters ?? 8;
  const minSize = opts.minClusterSize ?? 2;
  if (papers.length === 0) return [];

  const group = (level: ClusterLevel) => {
    const groups = new Map<string, { topic: Topic; ids: string[] }>();
    for (const p of papers) {
      const t = topicAt(p, level);
      if (!t) continue;
      const g = groups.get(t.id) ?? { topic: t, ids: [] };
      g.ids.push(p.id);
      groups.set(t.id, g);
    }
    return [...groups.values()].sort((a, b) => b.ids.length - a.ids.length);
  };

  const candidates = opts.level && opts.level !== 'auto' && opts.level !== 'keyword' ? [opts.level] : LEVELS;
  const evaluated = candidates.map((level) => {
    const groups = group(level);
    const sizable = groups.filter((x) => x.ids.length >= minSize);
    return { level, groups, sizable: sizable.length, covered: sizable.reduce((n, x) => n + x.ids.length, 0) };
  });
  // Finest level where most papers land in a few sizable groups; otherwise the
  // finest level that groups anything at all (extra groups fold into "Other").
  const pick =
    evaluated.find((e) => e.sizable > 0 && e.sizable <= maxClusters && e.covered >= papers.length * 0.6) ??
    evaluated.find((e) => e.sizable > 0) ??
    evaluated[0];
  const keep = pick.groups
    .filter((g) => g.ids.length >= minSize)
    .slice(0, maxClusters - 1)
    .map((g) => ({ id: `${pick.level}:${g.topic.id}`, label: g.topic.name, ids: g.ids }));
  return finish(keep, pick.level, papers);
}

// Single words OpenAlex attaches as keywords that name no research theme.
const GENERIC_FACETS = new Set(
  'change effect effects size model models system systems analysis method methods design study data process performance development application applications approach theory environment computer science engineering psychology medicine'.split(' '),
);
const ARXIV_CATEGORY = /^[a-z-]+\.[A-Z]{2}$/;
const normalizeFacet = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Greedy facet clustering over each paper's topics and keywords: repeatedly
 * take the facet shared by the most still-unassigned papers. Facets carried by
 * most of the set (usually the query itself, e.g. "virtual reality") are
 * skipped because they do not separate anything.
 */
export function facetClusters(papers: Paper[], opts: ClusterOptions = {}): Cluster[] {
  const maxClusters = opts.maxClusters ?? 8;
  const n = papers.length;
  if (n === 0) return [];
  const minSize = Math.max(opts.minClusterSize ?? 2, Math.ceil(n * 0.04));
  const variants = new Map<string, Map<string, number>>();
  const members = new Map<string, Set<string>>();
  for (const p of papers) {
    const facets = new Set<string>();
    for (const raw of [...(p.topics ?? []).filter((t) => t.level === 'topic').map((t) => t.name), ...(p.keywords ?? [])]) {
      // arXiv categories (cs.HC, q-bio.NC) are codes, not readable facets.
      if (ARXIV_CATEGORY.test(raw)) continue;
      const key = normalizeFacet(raw);
      if (!key || key.length < 3 || GENERIC_FACETS.has(key)) continue;
      const v = variants.get(key) ?? new Map<string, number>();
      v.set(raw, (v.get(raw) ?? 0) + 1);
      variants.set(key, v);
      facets.add(key);
    }
    for (const f of facets) {
      const set = members.get(f) ?? new Set<string>();
      set.add(p.id);
      members.set(f, set);
    }
  }
  // Facets on nearly half the set or more are too broad to be a branch of the map
  // (small sets get more slack, or nothing would qualify).
  const maxShare = n < 12 ? 0.75 : 0.45;
  const usable = [...members].filter(([, ids]) => ids.size >= minSize && ids.size <= n * maxShare);
  const label = (key: string) =>
    [...variants.get(key)!].sort((a, b) => b[1] - a[1] || Number(/^[A-Z]/.test(b[0])) - Number(/^[A-Z]/.test(a[0])))[0][0];
  const unassigned = new Set(papers.map((p) => p.id));
  const groups: Array<{ id: string; label: string; ids: string[] }> = [];
  while (groups.length < maxClusters - 1) {
    let best: { key: string; ids: string[] } | null = null;
    for (const [key, ids] of usable) {
      const free = [...ids].filter((id) => unassigned.has(id));
      if (free.length >= minSize && (!best || free.length > best.ids.length)) best = { key, ids: free };
    }
    if (!best) break;
    for (const id of best.ids) unassigned.delete(id);
    const text = label(best.key);
    groups.push({ id: `keyword:${best.key}`, label: text.charAt(0).toUpperCase() + text.slice(1), ids: best.ids });
  }
  // Keep the map's paper order inside each group.
  const order = new Map(papers.map((p, i) => [p.id, i]));
  for (const g of groups) g.ids.sort((a, b) => order.get(a)! - order.get(b)!);
  return finish(groups, 'keyword', papers);
}

/** How useful a clustering is: coverage, minus a penalty for one dominant group. */
export function clusteringScore(clusters: Cluster[], total: number): number {
  if (total === 0) return 0;
  const real = clusters.filter((c) => c.id !== 'other');
  if (real.length === 0) return 0;
  const covered = real.reduce((n, c) => n + c.paperIds.length, 0) / total;
  const largest = Math.max(...real.map((c) => c.paperIds.length)) / total;
  const groupsBonus = Math.min(real.length, 5) / 5;
  return covered * (1 - Math.max(0, largest - 0.45)) * (0.6 + 0.4 * groupsBonus);
}

/** Pick between topic-hierarchy and facet clustering, whichever separates the set better. */
export function clusterPapers(papers: Paper[], opts: ClusterOptions = {}): Cluster[] {
  if (opts.level === 'keyword') return facetClusters(papers, opts);
  if (opts.level && opts.level !== 'auto') return topicClusters(papers, opts);
  const byTopic = topicClusters(papers, opts);
  const byFacet = facetClusters(papers, opts);
  return clusteringScore(byFacet, papers.length) > clusteringScore(byTopic, papers.length) ? byFacet : byTopic;
}
