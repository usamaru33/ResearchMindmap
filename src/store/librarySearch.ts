import type { Paper } from '../types';
import { keysOf } from './identity';

/** The papers of one project to search in. */
export interface LibrarySource {
  projectId: string;
  projectName: string;
  /** The project open now (its papers are the live, possibly unsaved ones). */
  current: boolean;
  papers: Paper[];
}

export interface LibraryHit {
  /** The record from the open project when it has one, else from the first project listing it. */
  paper: Paper;
  projects: Array<{ id: string; name: string; current: boolean }>;
  inCurrent: boolean;
  score: number;
}

/** Case, accents and full-/half-width folded; kana keep their voicing marks (unlike the query evaluator's folding). */
export function foldText(text: string): string {
  return text
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Field weights: a word found in the title counts most. */
const FIELDS: Array<[number, (p: Paper) => string]> = [
  [6, (p) => p.title],
  [4, (p) => p.authors.join(' ')],
  [3, (p) => (p.tags ?? []).join(' ')],
  [2, (p) => `${p.venue} ${p.year || ''}`],
  [1, (p) => `${p.notes ?? ''} ${p.challenges} ${p.futureWork} ${p.abstract}`],
];

/**
 * How well a paper matches: every word must appear in some field (case,
 * accents and full-/half-width ignored); higher is better, null = no match.
 * Whole-word matches score double.
 */
export function libraryScore(words: string[], paper: Paper): number | null {
  const fields = FIELDS.map(([w, get]) => [w, ` ${foldText(get(paper))} `] as const);
  let score = 0;
  for (const word of words) {
    let best = 0;
    for (const [weight, text] of fields) {
      const at = text.indexOf(word);
      if (at < 0) continue;
      const whole = text[at - 1] === ' ' && text[at + word.length] === ' ';
      best = Math.max(best, weight * (whole ? 2 : 1));
    }
    if (best === 0) return null;
    score += best;
  }
  return score;
}

/**
 * Search the papers of all given projects (DESIGN 14.3). The same work in
 * several projects is one hit listing every project. An empty query lists
 * everything, the open project first.
 */
export function searchLibrary(sources: LibrarySource[], query: string, onlyProject?: string): LibraryHit[] {
  const words = foldText(query).split(' ').filter(Boolean);
  // Whether a work is in the open project does not depend on which record matched.
  const currentKeys = new Set(sources.filter((s) => s.current).flatMap((s) => s.papers.flatMap(keysOf)));
  const current = sources.find((s) => s.current);
  const ordered = [...sources].sort((a, b) => Number(b.current) - Number(a.current));
  const hits: LibraryHit[] = [];
  const byKey = new Map<string, LibraryHit>();
  for (const src of ordered) {
    if (onlyProject && src.projectId !== onlyProject) continue;
    for (const paper of src.papers) {
      const project = { id: src.projectId, name: src.projectName, current: src.current };
      const keys = keysOf(paper);
      const known = keys.map((k) => byKey.get(k)).find(Boolean);
      if (known) {
        if (!known.projects.some((p) => p.id === project.id)) known.projects.push(project);
        for (const k of keys) byKey.set(k, known);
        continue;
      }
      const score = words.length ? libraryScore(words, paper) : 0;
      if (score === null) continue;
      const inCurrent = keys.some((k) => currentKeys.has(k));
      const projects = [project];
      if (inCurrent && !src.current && current) projects.unshift({ id: current.projectId, name: current.projectName, current: true });
      const hit: LibraryHit = { paper, projects, inCurrent, score };
      hits.push(hit);
      for (const k of keys) byKey.set(k, hit);
    }
  }
  // Stable: equal scores keep project and paper order.
  return hits.map((h, i) => ({ h, i })).sort((a, b) => b.h.score - a.h.score || a.i - b.i).map((x) => x.h);
}

/** A copy for another project: screening decisions belong to the review they were made in. */
export function paperForCopy(paper: Paper): Paper {
  const copy = { ...paper };
  delete copy.screening;
  return copy;
}
