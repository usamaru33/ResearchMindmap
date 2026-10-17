import { useId, useState } from 'react';
import type { VagueSearchRequest } from '../../../shared/types';
import type { VagueState } from '../../hooks/useSearch';
import { Elapsed, ResultsSection, type BuildMapHandler } from './ResultsSection';
import styles from './SearchPanel.module.css';

interface VagueSearchProps {
  search: VagueState;
  onSearch: (request: VagueSearchRequest) => void;
  llmEnabled: boolean;
  mapIds: Set<string>;
  onBuildMap: BuildMapHandler;
  /** Hand a generated query over to the query tab. */
  onUseQuery: (query: string) => void;
}

const EXAMPLES = [
  'VRで自分の体の大きさが変わったと感じると、周りの物の大きさの感じ方も変わるかを調べた研究',
  'Robots that learn household tasks just by watching people do them a few times',
  '論文の査読コメントを自動で生成したり、査読の質を評価したりする研究',
];

const hasJapanese = (text: string) => /[぀-ヿ㐀-鿿]/.test(text);

export function VagueSearch({ search, onSearch, llmEnabled, mapIds, onBuildMap, onUseQuery }: VagueSearchProps) {
  const id = useId();
  const [description, setDescription] = useState('');
  const [useLlm, setUseLlm] = useState(true);
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [limit, setLimit] = useState(40);

  const loading = search.status === 'loading';
  const canSearch = description.trim().length >= 5 && !loading;
  const llmActive = llmEnabled && useLlm;

  const submit = () => {
    if (!canSearch) return;
    onSearch({
      description: description.trim(),
      useLlm,
      limit,
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
            どんな研究？
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
            placeholder="探したい研究を、思いつくままに書いてください（日本語・英語どちらでも）"
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
              LLM なしでは日本語の説明をうまく扱えません。英語で書くか、ANTHROPIC_API_KEY を設定すると精度が上がります。
            </div>
          )}
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Options</span>
          <div className={styles.chipRow}>
            <input
              className={`${styles.input} ${styles.yearInput}`}
              inputMode="numeric"
              placeholder="From"
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, '').slice(0, 4))}
              aria-label="Year from"
            />
            <span className={styles.muted}>–</span>
            <input
              className={`${styles.input} ${styles.yearInput}`}
              inputMode="numeric"
              placeholder="To"
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value.replace(/\D/g, '').slice(0, 4))}
              aria-label="Year to"
            />
            <label className={styles.inlineSelect}>
              results
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                {[20, 40, 60, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label
            className={`${styles.chip} ${llmActive ? styles.chipOn : ''} ${!llmEnabled ? styles.chipDisabled : ''}`}
            title={llmEnabled ? 'Claude でクエリを展開し、関連度を判定します' : 'ANTHROPIC_API_KEY が未設定です'}
          >
            <input type="checkbox" disabled={!llmEnabled} checked={llmActive} onChange={(e) => setUseLlm(e.target.checked)} />
            Use LLM（クエリ展開・関連度判定）
          </label>
        </div>

        <button type="submit" className={styles.searchBtn} disabled={!canSearch}>
          {loading ? (
            <>
              Searching… <Elapsed since={search.startedAt} />
            </>
          ) : (
            'なんとなく検索'
          )}
        </button>
      </form>

      <div className={styles.output}>
        {search.status === 'error' && <div className={styles.queryError}>{search.message}</div>}
        {response && search.status === 'done' && (
          <>
            <div className={styles.summary}>
              {response.results.length} results from {response.candidates} candidates in{' '}
              {(response.tookMs / 1000).toFixed(1)}s{' '}
              <span className={response.mode === 'llm' ? styles.modeLlm : styles.modeFallback}>
                {response.mode === 'llm' ? 'LLM' : 'LLM なし'}
              </span>
            </div>
            {response.warnings.map((w, i) => (
              <div key={i} className={styles.queryWarning}>
                {w}
              </div>
            ))}
            {response.englishSummary && (
              <div className={styles.interpretation}>
                <span className={styles.label}>Interpreted as</span>
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
                <span className={styles.label}>Generated queries — 絞り込みはクエリ検索で</span>
                <ul className={styles.generatedQueries}>
                  {response.expandedQueries.map((q) => (
                    <li key={q}>
                      <code>{q}</code>
                      <button type="button" className={styles.linkBtn} onClick={() => onUseQuery(q)}>
                        Use
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
                  <span className={styles.reportCount}>{s.error ? <span className={styles.errorText}>error</span> : s.count}</span>
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
