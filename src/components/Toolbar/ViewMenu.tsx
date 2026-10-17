import { useEffect, useRef, useState } from 'react';
import type { ColorMode } from '../MindMap/mapViewContext';
import styles from './Toolbar.module.css';

const MODES: Array<{ value: ColorMode; label: string }> = [
  { value: 'year', label: 'Year' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'status', label: 'Reading status' },
  { value: 'source', label: 'Source' },
];

interface ViewMenuProps {
  colorMode: ColorMode;
  onColorMode: (mode: ColorMode) => void;
  sizeByCitations: boolean;
  onSizeByCitations: (on: boolean) => void;
  filter: string;
  onFilter: (text: string) => void;
  matchCount: number | null;
}

export function ViewMenu({ colorMode, onColorMode, sizeByCitations, onSizeByCitations, filter, onFilter, matchCount }: ViewMenuProps) {
  const [open, setOpen] = useState(false);
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
        View ▾
      </button>
      {open && (
        <div className={styles.viewPopover} role="dialog" aria-label="View options">
          <label className={styles.viewLabel}>
            Find in map
            <input
              className={styles.viewInput}
              type="search"
              value={filter}
              placeholder="title, author, tag…"
              onChange={(e) => onFilter(e.target.value)}
              autoFocus
            />
          </label>
          {matchCount !== null && <div className={styles.viewHint}>{matchCount} matching papers highlighted</div>}
          <div className={styles.viewLabel}>Color by</div>
          <div className={styles.viewModes} role="radiogroup" aria-label="Color by">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={colorMode === m.value}
                className={`${styles.viewMode} ${colorMode === m.value ? styles.viewModeOn : ''}`}
                onClick={() => onColorMode(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <label className={styles.viewCheck}>
            <input type="checkbox" checked={sizeByCitations} onChange={(e) => onSizeByCitations(e.target.checked)} />
            Size by citation count
          </label>
        </div>
      )}
    </div>
  );
}
