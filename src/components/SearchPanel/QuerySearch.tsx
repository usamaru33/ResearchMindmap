import { useMemo, useState } from 'react';
import { formatQuery, parseQuery } from '../../../shared/query';
import type { SearchRequest, SourceName, SourceStatus } from '../../../shared/types';
import type { SearchState } from '../../hooks/useSearch';
import { QueryInput } from './QueryInput';
import { Elapsed, ResultsSection, type BuildMapHandler } from './ResultsSection';
import { SourceReports } from './SearchResults';
import { EMPTY_CHIPS, PUBLISHER_CHIPS, combineQuery, type FilterChips } from './searchFilters';
import styles from './SearchPanel.module.css';

interface QuerySearchProps {
  search: SearchState;
  onSearch: (request: SearchRequest) => void;
  sources: SourceStatus[];
  healthError: string | null;
  mapIds: Set<string>;
  onBuildMap: BuildMapHandler;
  text: string;
  onTextChange: (text: string) => void;
}

export function QuerySearch({ search, onSearch, sources, healthError, mapIds, onBuildMap, text, onTextChange }: QuerySearchProps) {
  const [chips, setChips] = useState<FilterChips>(EMPTY_CHIPS);
  const [excluded, setExcluded] = useState<Set<SourceName>>(new Set());
  const [limitPerSource, setLimitPerSource] = useState(25);

  const textParse = useMemo(() => (text.trim() ? parseQuery(text) : null), [text]);
  const combined = combineQuery(text, chips);
  const combinedParse = useMemo(() => (combined ? parseQuery(combined) : null), [combined]);
  const canonical = combinedParse?.ok ? formatQuery(combinedParse.query) : null;
  const chipError = textParse?.ok !== false && combinedParse && !combinedParse.ok ? combinedParse.errors[0].message : null;

  const activeSources = sources.filter((s) => s.enabled && !excluded.has(s.name)).map((s) => s.name);
  const loading = search.status === 'loading';
  const canSearch = !!combinedParse?.ok && !loading && (sources.length === 0 || activeSources.length > 0);

  const submit = () => {
    if (!canSearch) return;
    onSearch({ query: combined, sources: sources.length ? activeSources : undefined, limitPerSource });
  };

  const response = search.status === 'done' ? search.response : null;
  const togglePublisher = (key: string) =>
    setChips((c) => ({
      ...c,
      publishers: c.publishers.includes(key) ? c.publishers.filter((p) => p !== key) : [...c.publishers, key],
    }));

  return (
    <>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <QueryInput value={text} parse={textParse} canonical={canonical} onChange={onTextChange} onSubmit={submit} />
        {chipError && <div className={styles.queryError}>{chipError}</div>}

        <div className={styles.field}>
          <span className={styles.label}>Filters</span>
          <div className={styles.chipRow}>
            <input
              className={`${styles.input} ${styles.yearInput}`}
              inputMode="numeric"
              placeholder="From"
              value={chips.yearFrom}
              onChange={(e) => setChips({ ...chips, yearFrom: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              aria-label="Year from"
            />
            <span className={styles.muted}>–</span>
            <input
              className={`${styles.input} ${styles.yearInput}`}
              inputMode="numeric"
              placeholder="To"
              value={chips.yearTo}
              onChange={(e) => setChips({ ...chips, yearTo: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              aria-label="Year to"
            />
            <label className={`${styles.chip} ${chips.openAccess ? styles.chipOn : ''}`}>
              <input
                type="checkbox"
                checked={chips.openAccess}
                onChange={(e) => setChips({ ...chips, openAccess: e.target.checked })}
              />
              Open access
            </label>
          </div>
          <div className={styles.chipRow}>
            {PUBLISHER_CHIPS.map((p) => (
              <label key={p.key} className={`${styles.chip} ${chips.publishers.includes(p.key) ? styles.chipOn : ''}`}>
                <input type="checkbox" checked={chips.publishers.includes(p.key)} onChange={() => togglePublisher(p.key)} />
                {p.label}
              </label>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.labelRow}>
            <span className={styles.label}>Databases</span>
            <label className={styles.inlineSelect}>
              per source
              <select value={limitPerSource} onChange={(e) => setLimitPerSource(Number(e.target.value))}>
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {healthError && <div className={styles.queryError}>{healthError}</div>}
          <div className={styles.chipRow}>
            {sources.map((s) => (
              <label
                key={s.name}
                className={`${styles.chip} ${s.enabled && !excluded.has(s.name) ? styles.chipOn : ''} ${!s.enabled ? styles.chipDisabled : ''}`}
                title={s.reason}
              >
                <input
                  type="checkbox"
                  disabled={!s.enabled}
                  checked={s.enabled && !excluded.has(s.name)}
                  onChange={() =>
                    setExcluded((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.name)) next.delete(s.name);
                      else next.add(s.name);
                      return next;
                    })
                  }
                />
                {s.label}
                {s.reason && s.enabled && (
                  <span className={styles.chipHint} aria-hidden>
                    !
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className={styles.searchBtn} disabled={!canSearch}>
          {loading ? (
            <>
              Searching… <Elapsed since={search.startedAt} />
            </>
          ) : (
            'Search'
          )}
        </button>
      </form>

      <div className={styles.output}>
        {search.status === 'error' && <div className={styles.queryError}>{search.message}</div>}
        {response && search.status === 'done' && (
          <>
            <div className={styles.summary}>
              {response.results.length} results from {response.candidates} candidates in{' '}
              {(response.tookMs / 1000).toFixed(1)}s
            </div>
            {response.warnings.map((w, i) => (
              <div key={i} className={styles.queryWarning}>
                {w}
              </div>
            ))}
            <SourceReports reports={response.perSource} />
            <ResultsSection
              results={response.results}
              mapIds={mapIds}
              query={search.request.query}
              mode="query"
              onBuildMap={onBuildMap}
            />
          </>
        )}
      </div>
    </>
  );
}
