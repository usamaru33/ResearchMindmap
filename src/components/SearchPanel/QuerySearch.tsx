import { useMemo, useState } from 'react';
import { formatQuery, parseQuery } from '../../../shared/query';
import type { SearchRequest, SourceName, SourceStatus } from '../../../shared/types';
import type { SearchState } from '../../hooks/useSearch';
import { useSettings } from '../../hooks/settingsContext';
import { localizedReason } from '../../i18n/localized';
import { SOURCE_LIMIT_OPTIONS } from '../../store/settings';
import { QueryInput } from './QueryInput';
import { Elapsed, ResultsSection, type BuildMapHandler, type BuildTarget } from './ResultsSection';
import { SourceReports } from './SearchResults';
import { EMPTY_CHIPS, PUBLISHER_CHIPS, combineQuery, type FilterChips } from './searchFilters';
import { useT } from '../../hooks/useT';
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
  /** Where "Build" goes by default. */
  defaultTarget?: BuildTarget;
}

export function QuerySearch({ search, onSearch, sources, healthError, mapIds, onBuildMap, text, onTextChange, defaultTarget }: QuerySearchProps) {
  const [chips, setChips] = useState<FilterChips>(EMPTY_CHIPS);
  const { settings } = useSettings();
  const t = useT();
  // Until the user touches a control here, follow the saved defaults.
  const [excludedOverride, setExcluded] = useState<Set<SourceName> | null>(null);
  const [limitOverride, setLimitPerSource] = useState<number | null>(null);
  const excluded = excludedOverride ?? new Set(settings.excludedSources);
  const limitPerSource = limitOverride ?? settings.limitPerSource;

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
          <span className={styles.label}>{t('query.filters')}</span>
          <div className={styles.chipRow}>
            <input
              className={`${styles.input} ${styles.yearInput}`}
              inputMode="numeric"
              placeholder={t('query.from')}
              value={chips.yearFrom}
              onChange={(e) => setChips({ ...chips, yearFrom: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              aria-label={t('query.yearFrom')}
            />
            <span className={styles.muted}>–</span>
            <input
              className={`${styles.input} ${styles.yearInput}`}
              inputMode="numeric"
              placeholder={t('query.to')}
              value={chips.yearTo}
              onChange={(e) => setChips({ ...chips, yearTo: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              aria-label={t('query.yearTo')}
            />
            <label className={`${styles.chip} ${chips.openAccess ? styles.chipOn : ''}`}>
              <input
                type="checkbox"
                checked={chips.openAccess}
                onChange={(e) => setChips({ ...chips, openAccess: e.target.checked })}
              />
              {t('query.openAccess')}
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
            <span className={styles.label}>{t('query.databases')}</span>
            <label className={styles.inlineSelect}>
              {t('query.perSource')}
              <select value={limitPerSource} onChange={(e) => setLimitPerSource(Number(e.target.value))}>
                {SOURCE_LIMIT_OPTIONS.map((n) => (
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
                title={localizedReason(s, t.lang)}
              >
                <input
                  type="checkbox"
                  disabled={!s.enabled}
                  checked={s.enabled && !excluded.has(s.name)}
                  onChange={() =>
                    setExcluded(() => {
                      const next = new Set(excluded);
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
              {t('query.searching')} <Elapsed since={search.startedAt} />
            </>
          ) : (
            t('query.search')
          )}
        </button>
      </form>

      <div className={styles.output}>
        {search.status === 'error' && <div className={styles.queryError}>{search.message}</div>}
        {response && search.status === 'done' && (
          <>
            <div className={styles.summary}>
              {t('query.summary', { n: response.results.length, candidates: response.candidates, secs: (response.tookMs / 1000).toFixed(1) })}
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
              defaultTarget={defaultTarget}
              onBuildMap={onBuildMap}
            />
          </>
        )}
      </div>
    </>
  );
}
