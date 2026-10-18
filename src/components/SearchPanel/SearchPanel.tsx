import { useState } from 'react';
import type { SearchRequest, VagueSearchRequest } from '../../../shared/types';
import { useApiHealth } from '../../hooks/useApiHealth';
import type { SearchState, VagueState } from '../../hooks/useSearch';
import { QuerySearch } from './QuerySearch';
import type { BuildMapHandler } from './ResultsSection';
import { VagueSearch } from './VagueSearch';
import { SearchHistory } from './SearchHistory';
import type { HistoryEntry, Paper } from '../../types';
import { ExploreSearch } from '../Explore/ExploreSearch';
import { RecommendSearch } from './RecommendSearch';
import { useT } from '../../hooks/useT';
import styles from './SearchPanel.module.css';

export type { BuildMapHandler, BuildMode, BuildTarget } from './ResultsSection';

export type SearchTab = 'query' | 'vague' | 'explore' | 'recommend';
type Tab = SearchTab;

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
  /** Switch to a tab from outside (a new nonce triggers the switch). */
  tabRequest: { tab: SearchTab; nonce: number } | null;
  onBuildMap: BuildMapHandler;
  history: HistoryEntry[];
  onPinHistory: (id: string) => void;
  onRemoveHistory: (id: string) => void;
}

export function SearchPanel({
  search,
  onSearch,
  vague,
  onVague,
  mapIds,
  mapPapers,
  recommendIds,
  tabRequest,
  onBuildMap,
  history,
  onPinHistory,
  onRemoveHistory,
}: SearchPanelProps) {
  const health = useApiHealth();
  const t = useT();
  const [tab, setTab] = useState<Tab>(tabRequest?.tab ?? 'query');
  const [seenRequest, setSeenRequest] = useState(tabRequest?.nonce);
  if (tabRequest && tabRequest.nonce !== seenRequest) {
    setSeenRequest(tabRequest.nonce);
    setTab(tabRequest.tab);
  }
  const [queryText, setQueryText] = useState('');
  const [description, setDescription] = useState('');

  const applyEntry = (e: HistoryEntry) => {
    if (e.kind === 'vague') {
      setDescription(e.text);
      setTab('vague');
    } else {
      setQueryText(e.text);
      setTab('query');
    }
  };
  const rerun = (e: HistoryEntry) => {
    applyEntry(e);
    if (e.kind === 'vague') onVague({ description: e.text });
    else onSearch({ query: e.text });
  };
  const sources = health.status === 'ok' ? health.health.sources : [];
  const llmEnabled = health.status === 'ok' && health.health.llm.enabled;

  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'query'}
          className={`${styles.tab} ${tab === 'query' ? styles.tabActive : ''}`}
          onClick={() => setTab('query')}
        >
          {t('search.tab.query')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'vague'}
          className={`${styles.tab} ${tab === 'vague' ? styles.tabActive : ''}`}
          onClick={() => setTab('vague')}
        >
          {t('search.tab.vague')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'explore'}
          className={`${styles.tab} ${tab === 'explore' ? styles.tabActive : ''}`}
          onClick={() => setTab('explore')}
        >
          {t('search.tab.explore')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'recommend'}
          className={`${styles.tab} ${tab === 'recommend' ? styles.tabActive : ''}`}
          onClick={() => setTab('recommend')}
        >
          {t('search.tab.recommend')}
        </button>
      </div>

      <SearchHistory entries={history} onUse={applyEntry} onRerun={rerun} onPin={onPinHistory} onRemove={onRemoveHistory} />

      {/* Both tabs stay mounted so switching keeps their input and results. */}
      <div hidden={tab !== 'query'} className={styles.panel}>
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
      <div hidden={tab !== 'vague'} className={styles.panel}>
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
            setTab('query');
          }}
        />
      </div>
      <div hidden={tab !== 'explore'} className={styles.panel}>
        <ExploreSearch mapIds={mapIds} mapPapers={mapPapers} onBuildMap={onBuildMap} />
      </div>
      <div hidden={tab !== 'recommend'} className={styles.panel}>
        <RecommendSearch mapPapers={mapPapers} mapIds={mapIds} selectedIds={recommendIds} onBuildMap={onBuildMap} />
      </div>
    </div>
  );
}
