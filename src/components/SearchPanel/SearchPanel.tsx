import { useState } from 'react';
import type { SearchRequest, VagueSearchRequest } from '../../../shared/types';
import { useApiHealth } from '../../hooks/useApiHealth';
import type { SearchState, VagueState } from '../../hooks/useSearch';
import { QuerySearch } from './QuerySearch';
import type { BuildMapHandler } from './ResultsSection';
import { VagueSearch } from './VagueSearch';
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
}

export function SearchPanel({ search, onSearch, vague, onVague, mapIds, onBuildMap }: SearchPanelProps) {
  const health = useApiHealth();
  const [tab, setTab] = useState<Tab>('query');
  const [queryText, setQueryText] = useState('');
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
          onUseQuery={(q) => {
            setQueryText(q);
            setTab('query');
          }}
        />
      </div>
    </div>
  );
}
