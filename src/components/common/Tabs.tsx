import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { panelId, tabId } from './tabPanel';
import styles from './Tabs.module.css';

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
}

interface TabsProps<T extends string> {
  /** Prefix for element ids, unique on the page. */
  id: string;
  label: string;
  tabs: Array<TabDef<T>>;
  value: T;
  onChange: (tab: T) => void;
  className?: string;
}

/**
 * Tabs that follow the WAI-ARIA pattern: only the selected tab is in the
 * tab order, ←/→ (and Home/End) move between tabs and select them.
 */
export function Tabs<T extends string>({ id, label, tabs, value, onChange, className }: TabsProps<T>) {
  const list = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    const next =
      e.key === 'ArrowRight' ? (i + 1) % tabs.length
      : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? tabs.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    list.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(id, tabs[next].id))}`)?.focus();
  };
  return (
    <div className={`${styles.tabs} ${className ?? ''}`} role="tablist" aria-label={label} ref={list} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={tabId(id, t.id)}
          aria-selected={t.id === value}
          aria-controls={panelId(id, t.id)}
          tabIndex={t.id === value ? 0 : -1}
          className={`${styles.tab} ${t.id === value ? styles.active : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
