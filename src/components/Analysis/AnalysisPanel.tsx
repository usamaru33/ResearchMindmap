import { useState } from 'react';
import type { Paper } from '../../types';
import { useT } from '../../hooks/useT';
import { MapStatsView } from './MapStatsView';
import { TrendsView } from './TrendsView';
import styles from './Analysis.module.css';

interface AnalysisPanelProps {
  papers: Paper[];
  filter: string;
  onFilter: (text: string) => void;
  onFocusPaper: (id: string) => void;
  /** The map's latest query search, to start the trends with. */
  latestQuery: string;
}

export function AnalysisPanel({ papers, filter, onFilter, onFocusPaper, latestQuery }: AnalysisPanelProps) {
  const t = useT();
  const [tab, setTab] = useState<'map' | 'trends'>('map');
  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist">
        {(['map', 'trends'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={tab === v}
            className={`${styles.tab} ${tab === v ? styles.tabActive : ''}`}
            onClick={() => setTab(v)}
          >
            {t(v === 'map' ? 'analysis.tab.map' : 'analysis.tab.trends')}
          </button>
        ))}
      </div>
      {/* Trends keep their queries and chart while the other tab is shown. */}
      <div hidden={tab !== 'map'}>
        <MapStatsView papers={papers} filter={filter} onFilter={onFilter} onFocusPaper={onFocusPaper} />
      </div>
      <div hidden={tab !== 'trends'}>
        <TrendsView initialQuery={latestQuery} />
      </div>
    </div>
  );
}
