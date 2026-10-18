import { useEffect, useState } from 'react';
import type { Paper } from '../../../shared/types';
import { SearchResults } from './SearchResults';
import { useT } from '../../hooks/useT';
import styles from './SearchPanel.module.css';

export type BuildTarget = 'new' | 'current';
export type BuildMode = 'query' | 'vague';
export type BuildMapHandler = (papers: Paper[], target: BuildTarget, query: string, mode: BuildMode) => Promise<void>;

export function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  return <>{((now - since) / 1000).toFixed(1)}s</>;
}

interface ResultsSectionProps {
  /** Identity of the result set; selection resets when it changes. */
  results: Paper[];
  reasons?: Record<string, string>;
  mapIds: Set<string>;
  query: string;
  mode: BuildMode;
  /** Where "Build" goes by default. */
  defaultTarget?: BuildTarget;
  onBuildMap: BuildMapHandler;
}

export function ResultsSection({ results, reasons, mapIds, query, mode, defaultTarget = 'new', onBuildMap }: ResultsSectionProps) {
  const t = useT();
  const [target, setTarget] = useState<BuildTarget>(defaultTarget);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ for: Paper[] | null; ids: Set<string> }>({ for: null, ids: new Set() });

  // New results start fully selected.
  const selected = selection.for === results ? selection.ids : new Set(results.map((p) => p.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection({ for: results, ids: next });
  };
  const selectAll = (all: boolean) => setSelection({ for: results, ids: new Set(all ? results.map((p) => p.id) : []) });

  const build = async () => {
    const papers = results.filter((p) => selected.has(p.id));
    if (papers.length === 0) return;
    setBuilding(true);
    setBuildError(null);
    try {
      await onBuildMap(papers, target, query, mode);
    } catch (err) {
      setBuildError((err as Error).message);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <>
      <div className={styles.buildBar}>
        <div className={styles.buildTargets} role="radiogroup" aria-label={t('results.where')}>
          <label className={`${styles.chip} ${target === 'new' ? styles.chipOn : ''}`}>
            <input type="radio" name={`build-target-${mode}-${defaultTarget}`} checked={target === 'new'} onChange={() => setTarget('new')} />
            {t('results.newProject')}
          </label>
          <label className={`${styles.chip} ${target === 'current' ? styles.chipOn : ''}`}>
            <input
              type="radio"
              name={`build-target-${mode}-${defaultTarget}`}
              checked={target === 'current'}
              onChange={() => setTarget('current')}
            />
            {t('results.addToMap')}
          </label>
        </div>
        <button type="button" className={styles.searchBtn} onClick={build} disabled={building || selected.size === 0}>
          {building ? t('results.building') : t('results.build', { n: selected.size })}
        </button>
        {buildError && <div className={styles.queryError}>{buildError}</div>}
      </div>
      <SearchResults
        results={results}
        reasons={reasons}
        selected={selected}
        mapIds={mapIds}
        onToggle={toggle}
        onSelectAll={selectAll}
      />
    </>
  );
}
