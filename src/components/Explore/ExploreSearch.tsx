import { useMemo, useState } from 'react';
import type {
  ExploreEntity,
  ExploreKind,
  ExploreSearchResponse,
  ExploreSort,
  ExploreWorksRequest,
  ExploreWorksResponse,
} from '../../../shared/types';
import type { Paper } from '../../types';
import { useApiRequest } from '../../hooks/useSearch';
import { topCoauthors } from '../../store/coauthors';
import { researchFlow } from '../../utils/researchFlow';
import { Elapsed, ResultsSection, type BuildMapHandler } from '../SearchPanel/ResultsSection';
import { CoauthorNetwork } from './CoauthorNetwork';
import { YearHistogram } from './YearHistogram';
import panel from '../SearchPanel/SearchPanel.module.css';
import { useT } from '../../hooks/useT';
import styles from './Explore.module.css';

interface ExploreSearchProps {
  mapIds: Set<string>;
  mapPapers: Paper[];
  onBuildMap: BuildMapHandler;
}

const LIMITS = [25, 50, 100, 200];
const compact = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n.toLocaleString());

export function ExploreSearch({ mapIds, mapPapers, onBuildMap }: ExploreSearchProps) {
  const t = useT();
  const [kind, setKind] = useState<ExploreKind>('author');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ExploreEntity | null>(null);
  const [sort, setSort] = useState<ExploreSort>('cited');
  const [limit, setLimit] = useState(50);
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [networkScope, setNetworkScope] = useState<'list' | 'map'>('list');
  const candidates = useApiRequest<{ kind: ExploreKind; query: string }, ExploreSearchResponse>('/api/explore/search');
  const works = useApiRequest<ExploreWorksRequest, ExploreWorksResponse>('/api/explore/works');

  const find = (k = kind, q = query) => {
    if (q.trim().length < 2) return;
    setSelected(null);
    works.reset();
    candidates.run({ kind: k, query: q.trim() });
  };

  const load = (entity: ExploreEntity, patch: Partial<ExploreWorksRequest> = {}) => {
    setSelected(entity);
    works.run({
      kind: entity.kind,
      id: entity.id,
      sort,
      limit,
      yearMin: yearFrom ? Number(yearFrom) : undefined,
      yearMax: yearTo ? Number(yearTo) : undefined,
      ...patch,
    });
  };

  const exploreAuthor = (name: string) => {
    setKind('author');
    setQuery(name);
    find('author', name);
  };

  const response = works.state.status === 'done' ? works.state.response : null;
  const papers = useMemo(() => response?.papers ?? [], [response]);
  const flow = useMemo(() => researchFlow(papers), [papers]);
  const coauthors = useMemo(
    () => (selected?.kind === 'author' ? topCoauthors(papers, selected.name, 8) : []),
    [papers, selected],
  );
  const listQuery = selected ? `${selected.kind === 'author' ? 'author' : 'venue'}:"${selected.name.replace(/"/g, '')}"` : '';

  return (
    <>
      <form
        className={panel.form}
        onSubmit={(e) => {
          e.preventDefault();
          find();
        }}
      >
        <div className={panel.field}>
          <span className={panel.label}>{t('explore.target')}</span>
          <div className={panel.chipRow} role="radiogroup" aria-label={t('explore.kindLabel')}>
            {(['author', 'venue'] as const).map((k) => (
              <label key={k} className={`${panel.chip} ${kind === k ? panel.chipOn : ''}`}>
                <input type="radio" name="explore-kind" checked={kind === k} onChange={() => setKind(k)} />
                {t(`explore.kind.${k}`)}
              </label>
            ))}
          </div>
        </div>
        <input
          className={panel.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === 'author' ? t('explore.authorPlaceholder') : t('explore.venuePlaceholder')}
          aria-label={kind === 'author' ? t('explore.authorName') : t('explore.venueName')}
        />
        <button type="submit" className={panel.searchBtn} disabled={query.trim().length < 2 || candidates.state.status === 'loading'}>
          {candidates.state.status === 'loading' ? t('explore.searching') : t(`explore.find.${kind}`)}
        </button>
      </form>

      {candidates.state.status === 'error' && <div className={panel.queryError}>{candidates.state.message}</div>}
      {candidates.state.status === 'done' && !selected && (
        <div className={styles.candidates}>
          {candidates.state.response.entities.length === 0 && <p className={panel.empty}>{t('explore.none')}</p>}
          {candidates.state.response.entities.map((e) => (
            <button key={e.id} type="button" className={styles.candidate} onClick={() => load(e)}>
              <span className={styles.candidateName}>{e.name}</span>
              {e.detail && <span className={styles.candidateDetail}>{e.detail}</span>}
              <span className={styles.candidateStats}>
                {t('explore.stats', { works: compact(e.worksCount), cites: compact(e.citedByCount) })}
                {e.hIndex !== undefined && `・h ${e.hIndex}`}
              </span>
              {e.topics.length > 0 && <span className={styles.candidateTopics}>{e.topics.join(' / ')}</span>}
            </button>
          ))}
          {candidates.state.response.entities.length > 1 && (
            <p className={panel.muted}>{t('explore.homonyms')}</p>
          )}
        </div>
      )}

      {selected && (
        <div className={styles.entity}>
          <div className={styles.entityHeader}>
            <div>
              <div className={styles.entityName}>{selected.name}</div>
              <div className={styles.candidateDetail}>
                {[selected.detail, selected.orcid && `ORCID ${selected.orcid}`].filter(Boolean).join('・')}
              </div>
            </div>
            <button type="button" className={panel.linkBtn} onClick={() => setSelected(null)}>
              {t('explore.back')}
            </button>
          </div>

          <div className={panel.chipRow}>
            <label className={panel.inlineSelect}>
              {t('explore.sort')}
              <select
                value={sort}
                onChange={(e) => {
                  const next = e.target.value as ExploreSort;
                  setSort(next);
                  load(selected, { sort: next });
                }}
              >
                <option value="cited">{t('explore.sort.cited')}</option>
                <option value="recent">{t('explore.sort.recent')}</option>
              </select>
            </label>
            <label className={panel.inlineSelect}>
              {t('explore.limit')}
              <select
                value={limit}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setLimit(next);
                  load(selected, { limit: next });
                }}
              >
                {LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <input
              className={`${panel.input} ${panel.yearInput}`}
              inputMode="numeric"
              placeholder={t('query.from')}
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, '').slice(0, 4))}
              aria-label={t('explore.yearFrom')}
            />
            <span className={panel.muted}>–</span>
            <input
              className={`${panel.input} ${panel.yearInput}`}
              inputMode="numeric"
              placeholder={t('query.to')}
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value.replace(/\D/g, '').slice(0, 4))}
              aria-label={t('explore.yearTo')}
            />
            <button type="button" className={panel.linkBtn} onClick={() => load(selected)}>
              {t('explore.apply')}
            </button>
          </div>

          {works.state.status === 'loading' && (
            <p className={panel.muted}>
              {t('explore.loading')} <Elapsed since={works.state.startedAt} />
            </p>
          )}
          {works.state.status === 'error' && <div className={panel.queryError}>{works.state.message}</div>}

          {response && (
            <>
              <section className={styles.block}>
                <h4 className={panel.label}>{t('explore.perYear')}</h4>
                <YearHistogram
                  byYear={response.byYear}
                  onPickYear={(y) => {
                    setYearFrom(String(y));
                    setYearTo(String(y));
                    load(selected, { yearMin: y, yearMax: y });
                  }}
                />
              </section>

              {flow.length > 1 && (
                <section className={styles.block}>
                  <h4 className={panel.label}>{t('explore.flow', { n: papers.length })}</h4>
                  <ol className={styles.flow}>
                    {flow.map((f) => (
                      <li key={f.from}>
                        <span className={styles.flowYears}>
                          {f.from === f.to ? f.from : `${f.from}–${f.to}`}
                          <small>{t('explore.flowCount', { n: f.count })}</small>
                        </span>
                        <span className={styles.flowTopics}>{f.topics.map((t) => t.name).join(' / ') || '—'}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {coauthors.length > 0 && (
                <section className={styles.block}>
                  <h4 className={panel.label}>{t('explore.coauthors')}</h4>
                  <div className={panel.chipRow}>
                    {coauthors.map((c) => (
                      <button key={c.name} type="button" className={styles.coauthor} onClick={() => exploreAuthor(c.name)}>
                        {c.name} <small>{c.count}</small>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className={styles.block}>
                <div className={panel.labelRow}>
                  <h4 className={panel.label}>{t('explore.network')}</h4>
                  <div className={styles.scope} role="radiogroup" aria-label={t('explore.networkScope')}>
                    {(['list', 'map'] as const).map((s) => (
                      <label key={s} className={`${panel.chip} ${networkScope === s ? panel.chipOn : ''}`}>
                        <input type="radio" name="network-scope" checked={networkScope === s} onChange={() => setNetworkScope(s)} />
                        {t(`explore.scope.${s}`)}
                      </label>
                    ))}
                  </div>
                </div>
                <CoauthorNetwork
                  papers={networkScope === 'list' ? papers : mapPapers}
                  focus={selected.kind === 'author' ? selected.name : undefined}
                  onPickAuthor={exploreAuthor}
                />
              </section>

              <div className={panel.summary}>
                {t('explore.shown', { total: response.total.toLocaleString(), n: papers.length })}
              </div>
              <ResultsSection results={papers} mapIds={mapIds} query={listQuery} mode="query" onBuildMap={onBuildMap} />
            </>
          )}
        </div>
      )}

      {!selected && candidates.state.status === 'idle' && mapPapers.length > 1 && (
        <section className={styles.block}>
          <h4 className={panel.label}>{t('explore.mapNetwork')}</h4>
          <CoauthorNetwork papers={mapPapers} onPickAuthor={exploreAuthor} />
        </section>
      )}
    </>
  );
}
