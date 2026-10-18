import { useState } from 'react';
import type { Paper } from '../../types';
import { useT } from '../../hooks/useT';
import { normalizeTag, tagCounts } from '../../utils/reading';
import styles from './Library.module.css';

interface TagManagerProps {
  papers: Paper[];
  /** `to: null` removes the tag; renaming to an existing tag merges the two. */
  onRename: (from: string, to: string | null) => void;
  onShow: (tag: string) => void;
}

/** Every tag with its count: rename, merge into another, delete. */
export function TagManager({ papers, onRename, onShow }: TagManagerProps) {
  const t = useT();
  const tags = tagCounts(papers.map((p) => p.tags));
  const [editing, setEditing] = useState<{ tag: string; value: string } | null>(null);
  const existing = new Set(tags.map(([tag]) => tag));

  const commit = () => {
    if (!editing) return;
    const to = normalizeTag(editing.value);
    setEditing(null);
    if (!to || to === editing.tag) return;
    if (existing.has(to) && !window.confirm(t('tags.confirmMerge', { from: editing.tag, to }))) return;
    onRename(editing.tag, to);
  };

  if (tags.length === 0) return <div className={styles.empty}>{t('tags.none')}</div>;

  return (
    <div className={styles.check}>
      <p className={styles.meta}>{t('tags.hint')}</p>
      <ul className={styles.tagList}>
        {tags.map(([tag, n]) => (
          <li key={tag}>
            {editing?.tag === tag ? (
              <input
                className={styles.bulkTag}
                value={editing.value}
                list="tag-manager-tags"
                autoFocus
                aria-label={t('tags.renameLabel', { tag })}
                onChange={(e) => setEditing({ tag, value: e.target.value })}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <button type="button" className={styles.tag} title={t('tags.show')} onClick={() => onShow(tag)}>
                {tag}
              </button>
            )}
            <span className={styles.meta}>{t('tags.count', { n })}</span>
            <span className={styles.checkActions}>
              <button type="button" className={styles.bulkBtn} onClick={() => setEditing({ tag, value: tag })}>
                {t('tags.rename')}
              </button>
              <button
                type="button"
                className={`${styles.bulkBtn} ${styles.danger}`}
                onClick={() => window.confirm(t('tags.confirmDelete', { tag, n })) && onRename(tag, null)}
              >
                {t('library.delete')}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <datalist id="tag-manager-tags">
        {tags.map(([tag]) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
    </div>
  );
}
