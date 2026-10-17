import { useState } from 'react';
import type { SearchRequest, VagueSearchRequest } from '../../../shared/types';
import { useApiHealth } from '../../hooks/useApiHealth';
import type { SearchState, VagueState } from '../../hooks/useSearch';
import { QuerySearch } from './QuerySearch';
import type { BuildMapHandler } from './ResultsSection';
import { VagueSearch } from './VagueSearch';
import { SearchHistory } from './SearchHistory';
import type { HistoryEntry } from '../../types';
import styles from './SearchPanel.module.css';

export type { BuildMapHandler, BuildMode, BuildTarget } from './ResultsSection';

type Tab = 'query' | 'vague';

interface SearchPanelProps {
  search: SearchState;
  onSearch: (request: SearchRequest) => void;
  vague: VagueState;
  onVague: (request: VagueSearchRequest) => void;
  mapIds: Set<string>;
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
  onBuildMap,
  history,
  onPinHistory,
  onRemoveHistory,
}: SearchPanelProps) {
  const health = useApiHealth();
  const [tab, setTab] = useState<Tab>('query');
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
          クエリ検索
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'vague'}
          className={`${styles.tab} ${tab === 'vague' ? styles.tabActive : ''}`}
          onClick={() => setTab('vague')}
        >
          なんとなく検索
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
    </div>
  );
}
