import { useState } from 'react';
import type { SearchRequest, SearchResponse } from '../../../shared/types';
import { useApiHealth } from '../../hooks/useApiHealth';
import { useSearch } from '../../hooks/useSearch';
import { QuerySearch } from './QuerySearch';
import type { BuildMapHandler } from './ResultsSection';
import styles from './SearchPanel.module.css';

interface AddQuerySearchProps {
  mapIds: Set<string>;
  onBuildMap: BuildMapHandler;
  /** Record a finished search in the map's history. */
  onSearched: (request: SearchRequest, response: SearchResponse) => void;
}

/** Query search inside "Add paper": its own input and results, adding to this map by default. */
export function AddQuerySearch({ mapIds, onBuildMap, onSearched }: AddQuerySearchProps) {
  const health = useApiHealth();
  const search = useSearch();
  const [text, setText] = useState('');
  return (
    <div className={styles.panel}>
      <QuerySearch
        search={search.state}
        onSearch={async (req) => {
          const res = await search.run(req);
          if (res) onSearched(req, res);
        }}
        sources={health.status === 'ok' ? health.health.sources : []}
        healthError={health.status === 'error' ? health.message : null}
        mapIds={mapIds}
        onBuildMap={onBuildMap}
        text={text}
        onTextChange={setText}
        defaultTarget="current"
      />
    </div>
  );
}
