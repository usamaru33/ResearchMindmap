import { useMemo, useState } from 'react';
import type { Paper } from '../../types';
import { useT } from '../../hooks/useT';
import { rankItems, type PaletteItem } from '../../store/palette';
import { truncateAuthors } from '../../utils/helpers';
import styles from './CommandPalette.module.css';

export interface PaletteCommand {
  id: string;
  label: string;
  /** The name in the other UI language, so either can be typed. */
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  commands: PaletteCommand[];
  papers: Paper[];
  onFocusPaper: (id: string) => void;
  onClose: () => void;
}

/** Ctrl/⌘+K: find a command or a paper by name and run it / jump to it. */
export function CommandPalette({ commands, papers, onFocusPaper, onClose }: CommandPaletteProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const items = useMemo<PaletteItem[]>(
    () => [
      ...commands.map((c) => ({ id: c.id, kind: 'command' as const, label: c.label, detail: c.shortcut, keywords: c.keywords })),
      ...papers.map((p) => ({
        id: p.id,
        kind: 'paper' as const,
        label: p.title,
        detail: [truncateAuthors(p.authors, 2), p.venue, p.year && !p.venue.includes(String(p.year)) ? p.year : ''].filter(Boolean).join(' · '),
        keywords: [...p.authors, ...(p.tags ?? [])].join(' '),
      })),
    ],
    [commands, papers],
  );
  const results = useMemo(() => rankItems(items, query), [items, query]);
  const current = Math.min(active, Math.max(0, results.length - 1));

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    if (item.kind === 'paper') onFocusPaper(item.id);
    else commands.find((c) => c.id === item.id)?.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((current + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((current - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[current]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  const firstPaper = results.findIndex((r) => r.kind === 'paper');

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.dialog} role="dialog" aria-label={t('palette.title')}>
        <input
          className={styles.input}
          autoFocus
          value={query}
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.title')}
          aria-controls="palette-results"
          aria-activedescendant={results[current] ? `palette-${current}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul id="palette-results" className={styles.list} role="listbox">
          {results.map((r, i) => (
            <li key={`${r.kind}:${r.id}`} role="presentation">
              {(i === 0 || i === firstPaper) && (
                <div className={styles.group}>{r.kind === 'command' ? t('palette.commands') : t('palette.papers')}</div>
              )}
              <button
                id={`palette-${i}`}
                type="button"
                role="option"
                aria-selected={i === current}
                className={`${styles.item} ${i === current ? styles.active : ''}`}
                onMouseMove={() => i !== current && setActive(i)}
                onClick={() => choose(r)}
              >
                <span className={styles.label}>{r.label}</span>
                {r.detail && <span className={r.kind === 'command' ? styles.kbd : styles.detail}>{r.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
        {results.length === 0 && <div className={styles.empty}>{t('palette.none')}</div>}
        <div className={styles.footer}>{t('palette.hint')}</div>
      </div>
    </>
  );
}
