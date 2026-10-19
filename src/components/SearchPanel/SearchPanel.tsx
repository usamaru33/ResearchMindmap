import { useState, type ReactNode } from 'react';
import type { SearchRequest, VagueSearchRequest } from '../../../shared/types';
import { useApiHealth } from '../../hooks/useApiHealth';
import type { SearchState, VagueState } from '../../hooks/useSearch';
import { QuerySearch } from './QuerySearch';
import type { BuildMapHandler } from './ResultsSection';
import { VagueSearch } from './VagueSearch';
import { SearchHistory } from './SearchHistory';
import type { HistoryEntry, Paper } from '../../types';
import type { AlertsState } from '../../hooks/useAlerts';
import { ExploreSearch } from '../Explore/ExploreSearch';
import { RecommendSearch } from './RecommendSearch';
import { Tabs } from '../common/Tabs';
import { tabPanel } from '../common/tabPanel';
import { useT } from '../../hooks/useT';
import type { MessageKey } from '../../i18n';
import type { PanelTabs } from '../../store/navigation';
import styles from './SearchPanel.module.css';

export type { BuildMapHandler, BuildMode, BuildTarget } from './ResultsSection';

export type SearchTab = PanelTabs['search'];
type DatabaseTab = Exclude<SearchTab, 'mine'>;

const METHODS: Array<[DatabaseTab, MessageKey, MessageKey]> = [
  ['query', 'search.tab.query', 'search.method.query'],
  ['vague', 'search.tab.vague', 'search.method.vague'],
  ['explore', 'search.tab.explore', 'search.method.explore'],
  ['recommend', 'search.tab.recommend', 'search.method.recommend'],
];

interface SearchPanelProps {
  search: SearchState;
  onSearch: (request: SearchRequest) => void;
  vague: VagueState;
  onVague: (request: VagueSearchRequest) => void;
  mapIds: Set<string>;
  /** Papers on the current map (for the co-author network). */
  mapPapers: Paper[];
  /** Papers chosen in the library for recommendations. */
  recommendIds: string[];
  tab: SearchTab;
  onTab: (tab: SearchTab) => void;
  onBuildMap: BuildMapHandler;
  history: HistoryEntry[];
  onPinHistory: (id: string) => void;
  onRemoveHistory: (id: string) => void;
  alerts: AlertsState;
  /** Search across the user's own saved projects (shown for the "mine" scope). */
  librarySearch: ReactNode;
}

export function SearchPanel({
  search,
  onSearch,
  vague,
  onVague,
  mapIds,
  mapPapers,
  recommendIds,
  tab,
  onTab: setTab,
  onBuildMap,
  history,
  onPinHistory,
  onRemoveHistory,
  alerts,
  librarySearch,
}: SearchPanelProps) {
  const health = useApiHealth();
  const t = useT();
  const [queryText, setQueryText] = useState('');
  const [description, setDescription] = useState('');
  // Coming back to the databases returns to the method used last.
  const [lastMethod, setLastMethod] = useState<DatabaseTab>(tab === 'mine' ? 'query' : tab);
  const scope = tab === 'mine' ? 'mine' : 'databases';
  const method: DatabaseTab = tab === 'mine' ? lastMethod : tab;
  const chooseMethod = (m: DatabaseTab) => {
    setLastMethod(m);
    setTab(m);
  };

  const applyEntry = (e: HistoryEntry) => {
    if (e.kind === 'vague') {
      setDescription(e.text);
      chooseMethod('vague');
    } else {
      setQueryText(e.text);
      chooseMethod('query');
    }
  };
  const rerun = (e: HistoryEntry) => {
    applyEntry(e);
    if (e.kind === 'vague') onVague({ description: e.text });
    else onSearch({ query: e.text });
  };
  const sources = health.status === 'ok' ? health.health.sources : [];
  const llmEnabled = health.status === 'ok' && health.health.llm.enabled;
  const methodHint = METHODS.find(([id]) => id === method)![2];

  return (
    <div className={styles.panel}>
      <fieldset className={styles.scopes}>
        <legend className={styles.scopeLegend}>{t('search.scope')}</legend>
        {(['databases', 'mine'] as const).map((s) => (
          <label key={s} className={`${styles.scope} ${scope === s ? styles.scopeOn : ''}`}>
            <input
              type="radio"
              name="search-scope"
              checked={scope === s}
              onChange={() => (s === 'mine' ? setTab('mine') : chooseMethod(lastMethod))}
              aria-describedby={`search-scope-${s}-hint`}
            />
            <span className={styles.scopeIcon} aria-hidden="true">
              {s === 'databases' ? '🌐' : '📁'}
            </span>
            <span className={styles.scopeText}>
              <span className={styles.scopeTitle}>{t(s === 'databases' ? 'search.scope.databases' : 'search.scope.mine')}</span>
              <span id={`search-scope-${s}-hint`} className={styles.scopeHint}>
                {t(s === 'databases' ? 'search.scope.databasesHint' : 'search.scope.mineHint')}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div hidden={scope !== 'databases'} className={styles.panel}>
        <Tabs
          id="search"
          label={t('search.method')}
          tabs={METHODS.map(([id, label]) => ({ id, label: t(label) }))}
          value={method}
          onChange={chooseMethod}
        />
        <p className={styles.methodHint}>{t(methodHint)}</p>

        <SearchHistory
          entries={history}
          onUse={applyEntry}
          onRerun={rerun}
          onPin={onPinHistory}
          onRemove={onRemoveHistory}
          alerts={alerts}
          mapIds={mapIds}
          onBuildMap={onBuildMap}
        />

        {/* Every method stays mounted so switching keeps its input and results. */}
        <div {...tabPanel('search', 'query', method)} className={styles.panel}>
          <QuerySearch
            search={search}
            onSearch={onSearch}
            sources={sources}
            healthError={health.status === 'error' ? health.message : null}
            mapIds={mapIds}
            onBuildMap={onBuildMap}
            text={queryText}
            onTextChange={setQueryText}
          />
        </div>
        <div {...tabPanel('search', 'vague', method)} className={styles.panel}>
          <VagueSearch
            search={vague}
            onSearch={onVague}
            llmEnabled={llmEnabled}
            mapIds={mapIds}
            onBuildMap={onBuildMap}
            description={description}
            onDescriptionChange={setDescription}
            onUseQuery={(q) => {
              setQueryText(q);
              chooseMethod('query');
            }}
          />
        </div>
        <div {...tabPanel('search', 'explore', method)} className={styles.panel}>
          <ExploreSearch mapIds={mapIds} mapPapers={mapPapers} onBuildMap={onBuildMap} />
        </div>
        <div {...tabPanel('search', 'recommend', method)} className={styles.panel}>
          <RecommendSearch mapPapers={mapPapers} mapIds={mapIds} selectedIds={recommendIds} onBuildMap={onBuildMap} />
        </div>
      </div>

      <div hidden={scope !== 'mine'} className={styles.panel}>
        {librarySearch}
      </div>
    </div>
  );
}
