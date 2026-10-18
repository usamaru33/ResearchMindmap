import { useMemo, useState } from 'react';
import type { RecommendResponse } from '../../../shared/types';
import type { Paper } from '../../types';
import { useApiRequest } from '../../hooks/useSearch';
import { useT } from '../../hooks/useT';
import { matchExisting } from '../../store/identity';
import { pickSeeds, reasonText } from '../../store/recommend';
import { Elapsed, ResultsSection, type BuildMapHandler } from './ResultsSection';
import styles from './SearchPanel.module.css';

interface RecommendSearchProps {
  mapPapers: Paper[];
  mapIds: Set<string>;
  /** Papers chosen in the library; empty means "use the whole map". */
  selectedIds: string[];
  onBuildMap: BuildMapHandler;
}

interface RecommendRequest {
  seeds: Array<Pick<Paper, 'id' | 'ids'>>;
  exclude: string[];
  limit: number;
}

const LIMITS = [15, 30, 50];

export function RecommendSearch({ mapPapers, mapIds, selectedIds, onBuildMap }: RecommendSearchProps) {
  const t = useT();
  // A new library selection switches to it; the user's own choice holds until then.
  const [scopeChoice, setScopeChoice] = useState<{ for: string[]; value: 'map' | 'selected' } | null>(null);
  const scope = scopeChoice?.for === selectedIds ? scopeChoice.value : selectedIds.length ? 'selected' : 'map';
  const setScope = (value: 'map' | 'selected') => setScopeChoice({ for: selectedIds, value });
  const [limit, setLimit] = useState(30);
  const request = useApiRequest<RecommendRequest, RecommendResponse>('/api/papers/recommend');

  const useSelected = scope === 'selected' && selectedIds.length > 0;
  const base = useMemo(
    () => (useSelected ? mapPapers.filter((p) => selectedIds.includes(p.id)) : mapPapers),
    [useSelected, mapPapers, selectedIds],
  );
  const seeds = useMemo(() => pickSeeds(base, 100), [base]);
  const loading = request.state.status === 'loading';

  const run = () =>
    request.run({
      seeds: seeds.map((p) => ({ id: p.id, ids: p.ids })),
      exclude: mapPapers.map((p) => p.ids?.openalex).filter((id): id is string => !!id),
      limit,
    });

  const response = request.state.status === 'done' ? request.state.response : null;
  // The server only knows OpenAlex ids; drop anything the map already has under a DOI, arXiv id or title.
  const fresh = useMemo(() => {
    if (!response) return [];
    const match = matchExisting(mapPapers, response.papers);
    return response.papers.filter((p) => match.get(p.id) === p.id && !mapIds.has(p.id));
  }, [response, mapPapers, mapIds]);
  const reasons = useMemo(
    () =>
      response
        ? Object.fromEntries(Object.entries(response.reasons).map(([id, r]) => [id, reasonText(r, t)]))
        : undefined,
    [response, t],
  );

  return (
    <>
      <div className={styles.form}>
        <p className={styles.muted}>{t('rec.intro')}</p>
        <div className={styles.field}>
          <span className={styles.label}>{t('rec.scope')}</span>
          <div className={styles.chipRow} role="radiogroup" aria-label={t('rec.scope')}>
            <label className={`${styles.chip} ${!useSelected ? styles.chipOn : ''}`}>
              <input type="radio" name="rec-scope" checked={!useSelected} onChange={() => setScope('map')} />
              {t('rec.scope.map', { n: mapPapers.length })}
            </label>
            {selectedIds.length > 0 && (
              <label className={`${styles.chip} ${useSelected ? styles.chipOn : ''}`}>
                <input type="radio" name="rec-scope" checked={useSelected} onChange={() => setScope('selected')} />
                {t('rec.scope.selected', { n: selectedIds.length })}
              </label>
            )}
            <label className={styles.inlineSelect}>
              {t('rec.limit')}
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                {LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {seeds.length === 0 && <div className={styles.queryWarning}>{t('rec.noIds')}</div>}
          {base.length > 100 && <div className={styles.muted}>{t('rec.capped')}</div>}
        </div>
        <button type="button" className={styles.searchBtn} onClick={run} disabled={loading || seeds.length === 0}>
          {request.state.status === 'loading' ? (
            <>
              {t('rec.finding')} <Elapsed since={request.state.startedAt} />
            </>
          ) : (
            t('rec.find')
          )}
        </button>
      </div>

      <div className={styles.output}>
        {request.state.status === 'error' && <div className={styles.queryError}>{request.state.message}</div>}
        {response && (
          <>
            <div className={styles.summary}>
              {t('rec.summary', { seeds: response.seeds, candidates: response.candidates, n: fresh.length })}
            </div>
            {fresh.length === 0 ? (
              <div className={styles.empty}>{t('rec.none')}</div>
            ) : (
              <ResultsSection
                results={fresh}
                reasons={reasons}
                mapIds={mapIds}
                query={t('rec.rootQuery')}
                mode="query"
                defaultTarget="current"
                onBuildMap={onBuildMap}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
