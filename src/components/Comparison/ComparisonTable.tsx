import { useMemo, useState } from 'react';
import type { AspectFillResponse } from '../../../shared/types';
import type { Paper } from '../../types';
import { apiPost } from '../../api/client';
import { useApiHealth } from '../../hooks/useApiHealth';
import { useSettings } from '../../hooks/settingsContext';
import { EMPTY_FILTERS, filterPapers } from '../../store/library';
import { comparisonCsv } from '../../utils/comparisonCsv';
import { downloadText, safeFileName } from '../../utils/download';
import { useT } from '../../hooks/useT';
import styles from './ComparisonTable.module.css';

const PAPER_COL = 220;
const ASPECT_COL = 210;

interface ComparisonTableProps {
  papers: Paper[];
  aspects: string[];
  projectName: string;
  onSetAspects: (aspects: string[]) => void;
  onRenameAspect: (from: string, to: string) => void;
  onSetValues: (aspect: string, values: Record<string, string>) => void;
  onFocusPaper: (id: string) => void;
}

function EditableCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button type="button" className={styles.cell} onClick={() => setEditing(true)} title={t('compare.edit')}>
        {value || <span className={styles.placeholder}>—</span>}
      </button>
    );
  }
  return (
    <textarea
      className={styles.cellInput}
      defaultValue={value}
      autoFocus
      aria-label={t('compare.cell')}
      onBlur={(e) => {
        setEditing(false);
        if (e.target.value !== value) onSave(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setEditing(false);
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.target as HTMLTextAreaElement).blur();
      }}
    />
  );
}

export function ComparisonTable({
  papers,
  aspects,
  projectName,
  onSetAspects,
  onRenameAspect,
  onSetValues,
  onFocusPaper,
}: ComparisonTableProps) {
  const health = useApiHealth();
  const { settings } = useSettings();
  const t = useT();
  const SUGGESTED = t('compare.suggested').split('|');
  const llmEnabled = health.status === 'ok' && health.health.llm.enabled;
  const [newAspect, setNewAspect] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const rows = useMemo(() => filterPapers(papers, { ...EMPTY_FILTERS, text: filter }), [papers, filter]);

  const addAspect = (name: string) => {
    const a = name.trim();
    if (a && !aspects.includes(a)) onSetAspects([...aspects, a]);
    setNewAspect('');
  };

  const fill = async (aspect: string) => {
    // Only fill empty cells; the user's edits win.
    const targets = rows.filter((p) => !p.comparison?.[aspect]?.trim()).slice(0, 60);
    if (targets.length === 0) {
      setNote(t('compare.noEmpty'));
      return;
    }
    setBusy(aspect);
    setNote(null);
    try {
      const res = await apiPost<AspectFillResponse>('/api/llm/fill-aspect', {
        aspect,
        papers: targets,
        lang: settings.aiLanguage,
        useLlm: llmEnabled && settings.useLlm,
      });
      const filled = Object.fromEntries(Object.entries(res.values).filter(([, v]) => v));
      onSetValues(aspect, filled);
      setNote(t('compare.filled', { name: aspect, n: Object.keys(filled).length, how: res.mode === 'llm' ? t('compare.howLlm') : t('compare.howFallback') }));
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <input
          className={styles.input}
          type="search"
          placeholder={t('compare.filter')}
          aria-label={t('compare.filterLabel')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <input
          className={styles.input}
          list="aspect-suggestions"
          placeholder={t('compare.addAspect')}
          aria-label={t('compare.addAspectLabel')}
          value={newAspect}
          onChange={(e) => setNewAspect(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addAspect(newAspect)}
        />
        <datalist id="aspect-suggestions">
          {SUGGESTED.filter((s) => !aspects.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          type="button"
          className={styles.btn}
          onClick={() => downloadText(`${safeFileName(projectName)}-comparison.csv`, comparisonCsv(rows, aspects), 'text/csv')}
          disabled={aspects.length === 0}
        >
          {t('compare.exportCsv')}
        </button>
      </div>
      {aspects.length === 0 && (
        <div className={styles.empty}>
          {t('compare.empty')}
          <span className={styles.suggestions}>
            {SUGGESTED.map((s) => (
              <button key={s} type="button" className={styles.chip} onClick={() => addAspect(s)}>
                + {s}
              </button>
            ))}
          </span>
        </div>
      )}
      {note && <div className={styles.note}>{note}</div>}

      <div className={styles.scroller}>
        <table className={styles.table} style={{ width: PAPER_COL + ASPECT_COL * aspects.length }}>
          <colgroup>
            <col style={{ width: PAPER_COL }} />
            {aspects.map((a) => (
              <col key={a} style={{ width: ASPECT_COL }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className={styles.paperCol}>{t('compare.paper', { n: rows.length })}</th>
              {aspects.map((a) => (
                <th key={a}>
                  <div className={styles.head}>
                    <input
                      className={styles.headInput}
                      defaultValue={a}
                      aria-label={t('compare.rename', { name: a })}
                      onBlur={(e) => e.target.value.trim() !== a && onRenameAspect(a, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title={llmEnabled ? t('compare.fillLlm') : t('compare.fillFallback')}
                      disabled={busy !== null}
                      onClick={() => fill(a)}
                    >
                      {busy === a ? '…' : t('compare.fill')}
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={t('compare.remove', { name: a })}
                      onClick={() => window.confirm(t('compare.confirmRemove', { name: a })) && onSetAspects(aspects.filter((x) => x !== a))}
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className={styles.paperCol}>
                  <button type="button" className={styles.paperLink} onClick={() => onFocusPaper(p.id)}>
                    {p.title}
                  </button>
                  <div className={styles.meta}>
                    {p.year || t('compare.nd')}
                    {p.venue && ` · ${p.venue}`}
                  </div>
                </td>
                {aspects.map((a) => (
                  <td key={a}>
                    <EditableCell value={p.comparison?.[a] ?? ''} onSave={(v) => onSetValues(a, { [p.id]: v })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
