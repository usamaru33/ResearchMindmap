import { useId, useState } from 'react';
import type { Paper, ResolveItem, ResolveResponse } from '../../../shared/types';
import { apiPost } from '../../api/client';
import { truncateAuthors } from '../../utils/helpers';
import { useT } from '../../hooks/useT';
import styles from './Sidebar.module.css';

const KIND_LABEL: Record<Exclude<NonNullable<ResolveItem['kind']>, 'title'>, string> = {
  doi: 'DOI',
  arxiv: 'arXiv',
  openalex: 'OpenAlex',
  pmid: 'PubMed',
};

interface IdentifierImportProps {
  mapIds: Set<string>;
  onAdd: (papers: Paper[]) => void;
}

export function IdentifierImport({ mapIds, onAdd }: IdentifierImportProps) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ResolveItem[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const resolve = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<ResolveResponse>('/api/resolve', { inputs: lines.slice(0, 100) });
      setItems(res.items);
      setSelected(new Set(res.items.map((it, i) => (it.ok ? i : -1)).filter((i) => i >= 0)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };

  const add = () => {
    if (!items) return;
    onAdd(items.filter((it, i) => it.ok && it.paper && selected.has(i)).map((it) => it.paper!));
    setItems(null);
    setText('');
  };

  const failed = items?.filter((it) => !it.ok).length ?? 0;

  return (
    <div className={styles.importPanel}>
      <label className={styles.importLabel} htmlFor={id}>
        {t('import.label')}
      </label>
      <textarea
        id={id}
        className={styles.importInput}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'10.1145/3313831.3376358\nhttps://arxiv.org/abs/1706.03762\nDeep Residual Learning for Image Recognition'}
        spellCheck={false}
      />
      <button type="button" className={styles.importBtn} onClick={resolve} disabled={loading || lines.length === 0}>
        {loading ? t('import.resolving') : lines.length ? t('import.resolveN', { n: lines.length }) : t('import.resolve')}
      </button>
      {lines.length > 100 && <div className={styles.importNote}>{t('import.tooMany')}</div>}
      {error && <div className={styles.importError}>{error}</div>}

      {items && (
        <>
          <div className={styles.importNote}>
            {t('import.found', { n: items.length - failed })}
            {failed > 0 && t('import.notFound', { n: failed })}
          </div>
          <ul className={styles.importList}>
            {items.map((it, i) => (
              <li key={i} className={`${styles.importItem} ${it.ok ? '' : styles.importItemFailed}`}>
                {it.ok && it.paper ? (
                  <label>
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                    <span>
                      <span className={styles.importTitle}>
                        {it.paper.year ? `${it.paper.year} · ` : ''}
                        {it.paper.title}
                      </span>
                      <span className={styles.importMeta}>
                        {it.kind && (it.kind === 'title' ? t('import.kind.title') : KIND_LABEL[it.kind])} · {truncateAuthors(it.paper.authors, 2)}
                        {mapIds.has(it.paper.id) && ` · ${t('import.inMap')}`}
                      </span>
                    </span>
                  </label>
                ) : (
                  <span>
                    <span className={styles.importTitle}>{it.input}</span>
                    <span className={styles.importMeta}>{it.error}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className={styles.importBtn} onClick={add} disabled={selected.size === 0}>
            {t('import.add', { n: selected.size })}
          </button>
        </>
      )}
    </div>
  );
}
