import { normalizeTitle } from '../../shared/ids';
import type { Paper } from '../types';

function keysOf(p: Paper): string[] {
  const keys: string[] = [`id:${p.id}`];
  const ids = p.ids ?? {};
  for (const [k, v] of Object.entries(ids)) if (v) keys.push(`${k}:${String(v).toLowerCase()}`);
  // A paper's own id may itself be canonical ("doi:…", "arxiv:…").
  const m = p.id.match(/^(doi|arxiv|openalex|s2|pmid):(.+)$/);
  if (m) keys.push(`${m[1]}:${m[2].toLowerCase()}`);
  const t = normalizeTitle(p.title ?? '');
  if (t.length >= 20) keys.push(`title:${t}`);
  return keys;
}

/**
 * Map ids of incoming papers to the ids of papers already in the map that are
 * the same work (shared id, DOI, arXiv id, OpenAlex id, or normalized title
 * within a year). Incoming papers with no match map to themselves.
 */
export function matchExisting(existing: Paper[], incoming: Paper[]): Map<string, string> {
  const index = new Map<string, Paper>();
  for (const p of existing) for (const k of keysOf(p)) if (!index.has(k)) index.set(k, p);
  const out = new Map<string, string>();
  for (const p of incoming) {
    let hit: Paper | undefined;
    for (const k of keysOf(p)) {
      const cand = index.get(k);
      if (!cand) continue;
      if (k.startsWith('title:') && cand.year && p.year && Math.abs(cand.year - p.year) > 1) continue;
      hit = cand;
      break;
    }
    out.set(p.id, hit ? hit.id : p.id);
  }
  return out;
}
