import type { Paper } from '../../types';
import type { PanelTabs } from '../../store/navigation';
import { useT } from '../../hooks/useT';
import { MapStatsView } from './MapStatsView';
import { TrendsView } from './TrendsView';
import { MissingView } from './MissingView';
import { Tabs } from '../common/Tabs';
import { tabPanel } from '../common/tabPanel';
import styles from './Analysis.module.css';

interface AnalysisPanelProps {
  papers: Paper[];
  filter: string;
  onFilter: (text: string) => void;
  onFocusPaper: (id: string) => void;
  /** The map's latest query search, to start the trends with. */
  latestQuery: string;
  tab: PanelTabs['analyze'];
  onTab: (tab: PanelTabs['analyze']) => void;
  onAddWithLinks: (papers: Paper[], links: Array<[string, string]>) => void;
}

export function AnalysisPanel({ papers, filter, onFilter, onFocusPaper, latestQuery, tab, onTab: setTab, onAddWithLinks }: AnalysisPanelProps) {
  const t = useT();
  return (
    <div className={styles.panel}>
      <Tabs
        id="analysis"
        label={t('nav.analyze')}
        tabs={(['map', 'trends', 'missing'] as const).map((v) => ({ id: v, label: t(`analysis.tab.${v}`) }))}
        value={tab}
        onChange={setTab}
      />
      {/* Trends keep their queries and chart while the other tab is shown. */}
      <div {...tabPanel('analysis', 'map', tab)}>
        <MapStatsView papers={papers} filter={filter} onFilter={onFilter} onFocusPaper={onFocusPaper} />
      </div>
      <div {...tabPanel('analysis', 'trends', tab)}>
        <TrendsView initialQuery={latestQuery} />
      </div>
      <div {...tabPanel('analysis', 'missing', tab)}>
        <MissingView papers={papers} onFocusPaper={onFocusPaper} onAdd={onAddWithLinks} />
      </div>
    </div>
  );
}
