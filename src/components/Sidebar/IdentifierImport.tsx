import { useId, useState } from 'react';
import type { Paper, ResolveItem, ResolveResponse } from '../../../shared/types';
import { apiPost } from '../../api/client';
import { truncateAuthors } from '../../utils/helpers';
import styles from './Sidebar.module.css';

const KIND_LABEL: Record<NonNullable<ResolveItem['kind']>, string> = {
  doi: 'DOI',
  arxiv: 'arXiv',
  openalex: 'OpenAlex',
  pmid: 'PubMed',
  title: 'Title',
};

interface IdentifierImportProps {
  mapIds: Set<string>;
  onAdd: (papers: Paper[]) => void;
}

export function IdentifierImport({ mapIds, onAdd }: IdentifierImportProps) {
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
        DOI・arXiv ID・URL・PubMed ID・タイトルを 1 行に 1 件
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
        {loading ? 'Resolving…' : `Resolve ${lines.length || ''}`.trim()}
      </button>
      {lines.length > 100 && <div className={styles.importNote}>一度に解決できるのは 100 行までです</div>}
      {error && <div className={styles.importError}>{error}</div>}

      {items && (
        <>
          <div className={styles.importNote}>
            {items.length - failed} found{failed > 0 && ` · ${failed} not found`}
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
                        {it.kind && KIND_LABEL[it.kind]} · {truncateAuthors(it.paper.authors, 2)}
                        {mapIds.has(it.paper.id) && ' · in map'}
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
            Add {selected.size} to map
          </button>
        </>
      )}
    </div>
  );
}
