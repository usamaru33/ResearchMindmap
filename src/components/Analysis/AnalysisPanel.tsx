import type { Paper } from '../../types';
import { MapStatsView } from './MapStatsView';
import styles from './Analysis.module.css';

interface AnalysisPanelProps {
  papers: Paper[];
  filter: string;
  onFilter: (text: string) => void;
  onFocusPaper: (id: string) => void;
}

export function AnalysisPanel({ papers, filter, onFilter, onFocusPaper }: AnalysisPanelProps) {
  return (
    <div className={styles.panel}>
      <MapStatsView papers={papers} filter={filter} onFilter={onFilter} onFocusPaper={onFocusPaper} />
    </div>
  );
}
