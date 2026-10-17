import { useMemo, useState } from 'react';
import type { Paper, ReadingStatus } from '../../../shared/types';
import { EMPTY_FILTERS, filterPapers, sortPapers, type LibraryFilters, type SortDir, type SortKey } from '../../store/library';
import { getYearColor, truncateAuthors } from '../../utils/helpers';
import { STATUS_OPTIONS, normalizeTag, statusInfo } from '../../utils/reading';
import { exportPapers } from '../../utils/bibliography';
import styles from './Library.module.css';

interface LibraryProps {
  papers: Paper[];
  knownTags: string[];
  selectedId: string | null;
  onFocus: (id: string) => void;
  onUpdate: (ids: string[], patch: (paper: Paper) => Partial<Paper>) => void;
  onDelete: (ids: string[]) => void;
  onDraft: (ids: string[]) => void;
}

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'year', label: 'Year', className: styles.colYear },
  { key: 'title', label: 'Title' },
  { key: 'citations', label: 'Cites', className: styles.colNum },
  { key: 'status', label: 'Status', className: styles.colStatus },
  { key: 'rating', label: '★', className: styles.colNum },
];

export function Library({ papers, knownTags, selectedId, onFocus, onUpdate, onDelete, onDraft }: LibraryProps) {
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'added', dir: 'desc' });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState('');

  const rows = useMemo(() => sortPapers(filterPapers(papers, filters), sort.key, sort.dir), [papers, filters, sort]);
  // Selection only counts rows that still exist and are visible.
  const visibleChecked = rows.filter((p) => checked.has(p.id)).map((p) => p.id);
  const allChecked = rows.length > 0 && visibleChecked.length === rows.length;

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'title' ? 'asc' : 'desc' }));
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setStatus = (status: ReadingStatus) => onUpdate(visibleChecked, () => ({ status }));
  const addTag = () => {
    const tag = normalizeTag(bulkTag);
    if (!tag) return;
    onUpdate(visibleChecked, (p) => ({ tags: [...new Set([...(p.tags ?? []), tag])] }));
    setBulkTag('');
  };
  const remove = () => {
    if (window.confirm(`${visibleChecked.length} 件の論文をマップから削除します。よろしいですか？`)) {
      onDelete(visibleChecked);
      setChecked(new Set());
    }
  };

  return (
    <div className={styles.library}>
      <div className={styles.filters}>
        <input
          className={styles.search}
          type="search"
          value={filters.text}
          placeholder="Filter by title, author, venue, tag, notes…"
          aria-label="Filter papers"
          onChange={(e) => setFilters({ ...filters, text: e.target.value })}
        />
        <select
          className={styles.select}
          value={filters.status}
          aria-label="Status filter"
          onChange={(e) => setFilters({ ...filters, status: e.target.value as LibraryFilters['status'] })}
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filters.tag ?? ''}
          aria-label="Tag filter"
          onChange={(e) => setFilters({ ...filters, tag: e.target.value || null })}
        >
          <option value="">All tags</option>
          {knownTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.summary}>
        {rows.length} / {papers.length} papers
        {visibleChecked.length > 0 && ` · ${visibleChecked.length} selected`}
      </div>

      {visibleChecked.length > 0 && (
        <div className={styles.bulk}>
          {STATUS_OPTIONS.map((s) => (
            <button key={s.value} type="button" className={styles.bulkBtn} onClick={() => setStatus(s.value)}>
              <span className={styles.dot} style={{ background: s.color }} />
              {s.label}
            </button>
          ))}
          <input
            className={styles.bulkTag}
            value={bulkTag}
            list="library-tags"
            placeholder="+ tag"
            aria-label="Tag selected papers"
            onChange={(e) => setBulkTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
          />
          <datalist id="library-tags">
            {knownTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button type="button" className={styles.bulkBtn} onClick={() => onDraft(visibleChecked)}>
            Draft related work
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={() => exportPapers(papers.filter((p) => visibleChecked.includes(p.id)), 'bib', 'selected')}
          >
            Export .bib
          </button>
          <button type="button" className={`${styles.bulkBtn} ${styles.danger}`} onClick={remove}>
            Delete
          </button>
        </div>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colCheck}>
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allChecked}
                onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map((p) => p.id)))}
              />
            </th>
            {COLUMNS.map((c) => (
              <th key={c.key} className={c.className} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className={styles.sortBtn} onClick={() => toggleSort(c.key)}>
                  {c.label}
                  {sort.key === c.key && <span aria-hidden>{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const status = statusInfo(p.status ?? 'unread');
            return (
              <tr key={p.id} className={`${styles.row} ${p.id === selectedId ? styles.rowSelected : ''}`} onClick={() => onFocus(p.id)}>
                <td className={styles.colCheck} onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.title}`} />
                </td>
                <td className={styles.colYear}>
                  <span className={styles.year} style={{ background: getYearColor(p.year) }}>
                    {p.year || '—'}
                  </span>
                </td>
                <td>
                  <div className={styles.title}>{p.title}</div>
                  <div className={styles.meta}>
                    {truncateAuthors(p.authors, 2)}
                    {p.venue && ` · ${p.venue}`}
                  </div>
                  {p.tags && p.tags.length > 0 && (
                    <div className={styles.tags}>
                      {p.tags.map((t) => (
                        <span key={t} className={styles.tag}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className={styles.colNum}>{p.citationCount?.toLocaleString() ?? '—'}</td>
                <td className={styles.colStatus}>
                  <span className={styles.status} style={{ color: status?.color }}>
                    <span className={styles.dot} style={{ background: status?.color }} />
                    {status?.label}
                  </span>
                </td>
                <td className={styles.colNum}>{p.rating ? p.rating : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div className={styles.empty}>No papers match the filters.</div>}
    </div>
  );
}
