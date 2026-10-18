import { useId, useState } from 'react';
import type { VagueSearchRequest } from '../../../shared/types';
import type { VagueState } from '../../hooks/useSearch';
import { useSettings } from '../../hooks/settingsContext';
import { VAGUE_LIMIT_OPTIONS } from '../../store/settings';
import { Elapsed, ResultsSection, type BuildMapHandler } from './ResultsSection';
import { useT } from '../../hooks/useT';
import styles from './SearchPanel.module.css';

interface VagueSearchProps {
  search: VagueState;
  onSearch: (request: VagueSearchRequest) => void;
  llmEnabled: boolean;
  mapIds: Set<string>;
  onBuildMap: BuildMapHandler;
  /** Hand a generated query over to the query tab. */
  onUseQuery: (query: string) => void;
  description: string;
  onDescriptionChange: (text: string) => void;
}

const EXAMPLES = [
  'VRで自分の体の大きさが変わったと感じると、周りの物の大きさの感じ方も変わるかを調べた研究',
  'Robots that learn household tasks just by watching people do them a few times',
  '論文の査読コメントを自動で生成したり、査読の質を評価したりする研究',
];

const hasJapanese = (text: string) => /[぀-ヿ㐀-鿿]/.test(text);

export function VagueSearch({
  search,
  onSearch,
  llmEnabled,
  mapIds,
  onBuildMap,
  onUseQuery,
  description,
  onDescriptionChange: setDescription,
}: VagueSearchProps) {
  const id = useId();
  const { settings } = useSettings();
  const t = useT();
  const [useLlmOverride, setUseLlm] = useState<boolean | null>(null);
  const useLlm = useLlmOverride ?? settings.useLlm;
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [limitOverride, setLimit] = useState<number | null>(null);
  const limit = limitOverride ?? settings.vagueLimit;

  const loading = search.status === 'loading';
  const canSearch = description.trim().length >= 5 && !loading;
  const llmActive = llmEnabled && useLlm;

  const submit = () => {
    if (!canSearch) return;
    onSearch({
      description: description.trim(),
      useLlm,
      limit,
      lang: settings.aiLanguage,
      yearMin: yearFrom ? Number(yearFrom) : undefined,
      yearMax: yearTo ? Number(yearTo) : undefined,
    });
  };

  const response = search.status === 'done' ? search.response : null;

  return (
    <>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className={styles.field}>
          <label className={styles.label} htmlFor={id}>
            {t('vague.label')}
          </label>
          <textarea
            id={id}
            className={`${styles.input} ${styles.vagueInput}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t('vague.placeholder')}
          />
          {!description && (
            <div className={styles.examples}>
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className={styles.exampleText} onClick={() => setDescription(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          )}
          {!llmActive && hasJapanese(description) && (
            <div className={styles.queryWarning}>
              {t('vague.japaneseWarning')}
            </div>
          )}
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t('vague.options')}</span>
          <div className={styles.chipRow}>
            <input
              className={`${styles.input} ${styles.yearInput}`}
              inputMode="numeric"
              placeholder={t('query.from')}
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, '').slice(0, 4))}
              aria-label={t('query.yearFrom')}
            />
            <span className={styles.muted}>–</span>
            <input
              className={`${styles.input} ${styles.yearInput}`}
              inputMode="numeric"
              placeholder={t('query.to')}
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value.replace(/\D/g, '').slice(0, 4))}
              aria-label={t('query.yearTo')}
            />
            <label className={styles.inlineSelect}>
              {t('vague.results')}
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                {VAGUE_LIMIT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label
            className={`${styles.chip} ${llmActive ? styles.chipOn : ''} ${!llmEnabled ? styles.chipDisabled : ''}`}
            title={llmEnabled ? t('vague.llmTitle') : t('vague.llmMissing')}
          >
            <input type="checkbox" disabled={!llmEnabled} checked={llmActive} onChange={(e) => setUseLlm(e.target.checked)} />
            {t('vague.useLlm')}
          </label>
        </div>

        <button type="submit" className={styles.searchBtn} disabled={!canSearch}>
          {loading ? (
            <>
              {t('query.searching')} <Elapsed since={search.startedAt} />
            </>
          ) : (
            t('vague.search')
          )}
        </button>
      </form>

      <div className={styles.output}>
        {search.status === 'error' && <div className={styles.queryError}>{search.message}</div>}
        {response && search.status === 'done' && (
          <>
            <div className={styles.summary}>
              {t('query.summary', { n: response.results.length, candidates: response.candidates, secs: (response.tookMs / 1000).toFixed(1) })}{' '}
              <span className={response.mode === 'llm' ? styles.modeLlm : styles.modeFallback}>
                {response.mode === 'llm' ? t('vague.modeLlm') : t('vague.modeFallback')}
              </span>
            </div>
            {response.warnings.map((w, i) => (
              <div key={i} className={styles.queryWarning}>
                {w}
              </div>
            ))}
            {response.englishSummary && (
              <div className={styles.interpretation}>
                <span className={styles.label}>{t('vague.interpreted')}</span>
                <p>{response.englishSummary}</p>
                {response.concepts.length > 0 && (
                  <div className={styles.chipRow}>
                    {response.concepts.map((c) => (
                      <span key={c} className={styles.metaTag}>
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {response.expandedQueries.length > 0 && (
              <div className={styles.field}>
                <span className={styles.label}>{t('vague.generated')}</span>
                <ul className={styles.generatedQueries}>
                  {response.expandedQueries.map((q) => (
                    <li key={q}>
                      <code>{q}</code>
                      <button type="button" className={styles.linkBtn} onClick={() => onUseQuery(q)}>
                        {t('vague.use')}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ul className={styles.reports}>
              {response.stages.map((s, i) => (
                <li key={i} className={styles.report} title={s.error ?? s.query}>
                  <span className={`${styles.reportDot} ${styles[s.error ? 'report_error' : 'report_ok']}`} aria-hidden />
                  <span className={styles.reportName}>{s.label}</span>
                  <span className={styles.reportCount}>{s.error ? <span className={styles.errorText}>{t('report.error')}</span> : s.count}</span>
                  {(s.error || s.query) && <span className={styles.reportNote}>{s.error ?? s.query}</span>}
                </li>
              ))}
            </ul>
            <ResultsSection
              results={response.results}
              reasons={response.reasons}
              mapIds={mapIds}
              query={search.request.description}
              mode="vague"
              onBuildMap={onBuildMap}
            />
          </>
        )}
      </div>
    </>
  );
}
