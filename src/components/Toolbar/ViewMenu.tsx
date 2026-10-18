import { useEffect, useRef, useState } from 'react';
import { useApiHealth } from '../../hooks/useApiHealth';
import { useT } from '../../hooks/useT';
import type { ColorMode } from '../MindMap/mapViewContext';
import styles from './Toolbar.module.css';

const MODES: ColorMode[] = ['year', 'cluster', 'status', 'source', 'screening'];

interface ViewMenuProps {
  colorMode: ColorMode;
  onColorMode: (mode: ColorMode) => void;
  sizeByCitations: boolean;
  onSizeByCitations: (on: boolean) => void;
  filter: string;
  onFilter: (text: string) => void;
  matchCount: number | null;
  clusterCount: number;
  /** Resolves with a status message. */
  onNameClusters: () => Promise<string>;
}

export function ViewMenu({
  colorMode,
  onColorMode,
  sizeByCitations,
  onSizeByCitations,
  filter,
  onFilter,
  matchCount,
  clusterCount,
  onNameClusters,
}: ViewMenuProps) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [namingNote, setNamingNote] = useState<string | null>(null);
  const health = useApiHealth();
  const t = useT();
  const llmEnabled = health.status === 'ok' && health.health.llm.enabled;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const active = colorMode !== 'year' || sizeByCitations || filter.trim() !== '';

  return (
    <div className={styles.viewMenu} ref={ref}>
      <button
        className={`${styles.btn} ${active ? styles.btnHighlight : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {t('view.button')}
      </button>
      {open && (
        <div className={styles.viewPopover} role="dialog" aria-label={t('view.options')}>
          <label className={styles.viewLabel}>
            {t('view.find')}
            <input
              className={styles.viewInput}
              type="search"
              value={filter}
              placeholder={t('view.findPlaceholder')}
              onChange={(e) => onFilter(e.target.value)}
              autoFocus
            />
          </label>
          {matchCount !== null && <div className={styles.viewHint}>{t('view.matches', { n: matchCount })}</div>}
          <div className={styles.viewLabel}>{t('view.colorBy')}</div>
          <div className={styles.viewModes} role="radiogroup" aria-label={t('view.colorBy')}>
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={colorMode === m}
                className={`${styles.viewMode} ${colorMode === m ? styles.viewModeOn : ''}`}
                onClick={() => onColorMode(m)}
              >
                {t(`view.mode.${m}`)}
              </button>
            ))}
          </div>
          <label className={styles.viewCheck}>
            <input type="checkbox" checked={sizeByCitations} onChange={(e) => onSizeByCitations(e.target.checked)} />
            {t('view.sizeByCitations')}
          </label>
          {clusterCount > 0 && (
            <>
              <button
                type="button"
                className={styles.viewMode}
                disabled={!llmEnabled || naming}
                title={llmEnabled ? t('view.nameTitle') : t('view.nameNeedsKey')}
                onClick={async () => {
                  setNaming(true);
                  setNamingNote(await onNameClusters());
                  setNaming(false);
                }}
              >
                {naming ? t('view.naming') : t('view.name')}
              </button>
              <div className={styles.viewHint}>{namingNote ?? t('view.nameHint')}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
