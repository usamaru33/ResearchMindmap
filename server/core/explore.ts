import type { ExploreEntity, ExploreKind, ExploreSort, ExploreWorksResponse } from '../../shared/types';
import type { HttpClient } from '../infra/http';
import { OPENALEX_SELECT, normalizeOpenAlexWork, type OpenAlexWork } from '../sources/openalex';

const API = 'https://api.openalex.org';

export interface ExploreContext {
  http: HttpClient;
  apiKey?: string;
  signal?: AbortSignal;
}

interface OpenAlexAuthor {
  id: string;
  display_name: string;
  orcid?: string | null;
  works_count?: number;
  cited_by_count?: number;
  last_known_institutions?: Array<{ display_name?: string; country_code?: string }>;
  topics?: Array<{ display_name: string }>;
  summary_stats?: { h_index?: number };
}

interface OpenAlexVenue {
  id: string;
  display_name: string;
  works_count?: number;
  cited_by_count?: number;
  host_organization_name?: string | null;
  type?: string | null;
  topics?: Array<{ display_name: string }>;
  summary_stats?: { h_index?: number };
}

const SELECT: Record<ExploreKind, string> = {
  author: 'id,display_name,orcid,works_count,cited_by_count,last_known_institutions,topics,summary_stats',
  venue: 'id,display_name,works_count,cited_by_count,host_organization_name,type,topics,summary_stats',
};

const ENDPOINT: Record<ExploreKind, string> = { author: 'authors', venue: 'sources' };

/** Works filter for "everything by this author" / "everything published in this venue". */
const WORKS_FILTER: Record<ExploreKind, string> = {
  author: 'authorships.author.id',
  venue: 'primary_location.source.id',
};

const ID_PATTERN: Record<ExploreKind, RegExp> = { author: /^A\d+$/, venue: /^S\d+$/ };

function params(ctx: ExploreContext, entries: Record<string, string>): string {
  const p = new URLSearchParams(entries);
  if (ctx.apiKey) p.set('api_key', ctx.apiKey);
  return p.toString();
}

const shortId = (url: string) => url.replace(/^https:\/\/openalex\.org\//, '');

export function isExploreId(kind: ExploreKind, id: string): boolean {
  return ID_PATTERN[kind].test(id);
}

function toEntity(kind: ExploreKind, raw: OpenAlexAuthor & OpenAlexVenue): ExploreEntity {
  const institution = raw.last_known_institutions?.[0];
  const detail =
    kind === 'author'
      ? institution?.display_name && [institution.display_name, institution.country_code].filter(Boolean).join(', ')
      : [raw.host_organization_name, raw.type].filter(Boolean).join(' · ');
  return {
    kind,
    id: shortId(raw.id),
    name: raw.display_name,
    detail: detail || undefined,
    worksCount: raw.works_count ?? 0,
    citedByCount: raw.cited_by_count ?? 0,
    hIndex: raw.summary_stats?.h_index,
    topics: (raw.topics ?? []).slice(0, 3).map((t) => t.display_name),
    orcid: raw.orcid?.replace(/^https:\/\/orcid\.org\//, '') || undefined,
  };
}

/** Find authors or venues by name. OpenAlex orders them by relevance, then citations. */
export async function searchEntities(kind: ExploreKind, query: string, ctx: ExploreContext): Promise<ExploreEntity[]> {
  const url = `${API}/${ENDPOINT[kind]}?${params(ctx, { search: query, 'per-page': '10', select: SELECT[kind] })}`;
  const { data } = await ctx.http.getJson<{ results: Array<OpenAlexAuthor & OpenAlexVenue> }>('openalex', url, { signal: ctx.signal });
  return data.results.map((r) => toEntity(kind, r));
}

export interface EntityWorksOptions {
  limit: number;
  sort: ExploreSort;
  yearMin?: number;
  yearMax?: number;
}

function yearFilter(min?: number, max?: number): string | null {
  if (min && max) return `publication_year:${min}-${max}`;
  if (min) return `publication_year:>${min - 1}`;
  if (max) return `publication_year:<${max + 1}`;
  return null;
}

/** An author's or a venue's works, plus how many they published each year. */
export async function entityWorks(
  kind: ExploreKind,
  id: string,
  opts: EntityWorksOptions,
  ctx: ExploreContext,
): Promise<ExploreWorksResponse> {
  const filter = [`${WORKS_FILTER[kind]}:${id}`, yearFilter(opts.yearMin, opts.yearMax)].filter(Boolean).join(',');
  const sort = opts.sort === 'recent' ? 'publication_date:desc' : 'cited_by_count:desc';
  const papers = [];
  let total = 0;
  const pages = Math.ceil(opts.limit / 100);
  for (let page = 1; page <= pages; page++) {
    const perPage = Math.min(100, opts.limit - (page - 1) * 100);
    const url = `${API}/works?${params(ctx, { filter, sort, 'per-page': String(perPage), page: String(page), select: OPENALEX_SELECT })}`;
    const { data } = await ctx.http.getJson<{ meta: { count: number }; results: OpenAlexWork[] }>('openalex', url, { signal: ctx.signal });
    total = data.meta.count;
    papers.push(...data.results.map(normalizeOpenAlexWork));
    if (data.results.length < perPage) break;
  }

  // The year histogram covers every work, not just the page we listed. It is
  // cosmetic, so a failure here should not lose the list.
  let byYear: ExploreWorksResponse['byYear'] = [];
  try {
    const url = `${API}/works?${params(ctx, { filter, group_by: 'publication_year' })}`;
    const { data } = await ctx.http.getJson<{ group_by: Array<{ key: string; count: number }> }>('openalex', url, { signal: ctx.signal });
    byYear = data.group_by
      .map((g) => ({ year: Number(g.key), count: g.count }))
      .filter((g) => Number.isFinite(g.year) && g.year > 0)
      .sort((a, b) => a.year - b.year);
  } catch {
    byYear = [];
  }
  return { papers, total, byYear };
}
