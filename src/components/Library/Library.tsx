import { useMemo, useState } from 'react';
import type { Paper, ReadingStatus } from '../../../shared/types';
import { EMPTY_FILTERS, filterPapers, sortPapers, type LibraryFilters, type SortDir, type SortKey } from '../../store/library';
import { getYearColor, truncateAuthors } from '../../utils/helpers';
import { STATUS_OPTIONS, normalizeTag, statusInfo } from '../../utils/reading';
import { exportPapers } from '../../utils/bibliography';
import { useT } from '../../hooks/useT';
import { LibraryCheck } from './LibraryCheck';
import { TagManager } from './TagManager';
import type { MessageKey } from '../../i18n';
import type { PanelTabs } from '../../store/navigation';
import styles from './Library.module.css';

interface LibraryProps {
  papers: Paper[];
  knownTags: string[];
  selectedId: string | null;
  onFocus: (id: string) => void;
  onUpdate: (ids: string[], patch: (paper: Paper) => Partial<Paper>) => void;
  onDelete: (ids: string[]) => void;
  onDraft: (ids: string[]) => void;
  onRecommend: (ids: string[]) => void;
  onMerge: (keepId: string, mergeIds: string[]) => void;
  onRenameTag: (from: string, to: string | null) => void;
  view: PanelTabs['library'];
  onView: (view: PanelTabs['library']) => void;
}

const COLUMNS: Array<{ key: SortKey; label: MessageKey | '★'; className?: string }> = [
  { key: 'year', label: 'library.col.year', className: styles.colYear },
  { key: 'title', label: 'library.col.title' },
  { key: 'citations', label: 'library.col.citations', className: styles.colNum },
  { key: 'status', label: 'library.col.status', className: styles.colStatus },
  { key: 'rating', label: '★', className: styles.colNum },
];

export function Library({ papers, knownTags, selectedId, onFocus, onUpdate, onDelete, onDraft, onRecommend, onMerge, onRenameTag, view, onView: setView }: LibraryProps) {
  const t = useT();
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
    if (window.confirm(t('library.confirmDelete', { n: visibleChecked.length }))) {
      onDelete(visibleChecked);
      setChecked(new Set());
    }
  };

  const tabs = (
    <div className={styles.tabs} role="tablist">
      {(['list', 'tags', 'check'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          className={`${styles.tab} ${view === v ? styles.tabActive : ''}`}
          onClick={() => setView(v)}
        >
          {t(v === 'list' ? 'library.tab.list' : v === 'tags' ? 'library.tab.tags' : 'library.tab.check')}
        </button>
      ))}
    </div>
  );

  if (view === 'tags') {
    return (
      <div className={styles.library}>
        {tabs}
        <TagManager
          papers={papers}
          onRename={onRenameTag}
          onShow={(tag) => {
            setFilters({ ...EMPTY_FILTERS, tag });
            setView('list');
          }}
        />
      </div>
    );
  }

  if (view === 'check') {
    return (
      <div className={styles.library}>
        {tabs}
        <LibraryCheck papers={papers} onFocus={onFocus} onUpdate={onUpdate} onDelete={onDelete} onMerge={onMerge} />
      </div>
    );
  }

  return (
    <div className={styles.library}>
      {tabs}
      <div className={styles.filters}>
        <input
          className={styles.search}
          type="search"
          value={filters.text}
          placeholder={t('library.filter')}
          aria-label={t('library.filterLabel')}
          onChange={(e) => setFilters({ ...filters, text: e.target.value })}
        />
        <select
          className={styles.select}
          value={filters.status}
          aria-label={t('library.statusFilter')}
          onChange={(e) => setFilters({ ...filters, status: e.target.value as LibraryFilters['status'] })}
        >
          <option value="all">{t('library.allStatuses')}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {t(s.label)}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filters.tag ?? ''}
          aria-label={t('library.tagFilter')}
          onChange={(e) => setFilters({ ...filters, tag: e.target.value || null })}
        >
          <option value="">{t('library.allTags')}</option>
          {knownTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.summary}>
        {t('library.count', { shown: rows.length, total: papers.length })}
        {visibleChecked.length > 0 && t('library.selected', { n: visibleChecked.length })}
      </div>

      {visibleChecked.length > 0 && (
        <div className={styles.bulk}>
          {STATUS_OPTIONS.map((s) => (
            <button key={s.value} type="button" className={styles.bulkBtn} onClick={() => setStatus(s.value)}>
              <span className={styles.dot} style={{ background: s.color }} />
              {t(s.label)}
            </button>
          ))}
          <input
            className={styles.bulkTag}
            value={bulkTag}
            list="library-tags"
            placeholder={t('reading.tagPlaceholder')}
            aria-label={t('library.tagSelected')}
            onChange={(e) => setBulkTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
          />
          <datalist id="library-tags">
            {knownTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          <button type="button" className={styles.bulkBtn} onClick={() => onDraft(visibleChecked)}>
            {t('library.draft')}
          </button>
          <button type="button" className={styles.bulkBtn} onClick={() => onRecommend(visibleChecked)}>
            {t('library.similar')}
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={() => exportPapers(papers.filter((p) => visibleChecked.includes(p.id)), 'bib', 'selected')}
          >
            {t('library.exportBib')}
          </button>
          <button type="button" className={`${styles.bulkBtn} ${styles.danger}`} onClick={remove}>
            {t('library.delete')}
          </button>
        </div>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colCheck}>
              <input
                type="checkbox"
                aria-label={t('library.selectAll')}
                checked={allChecked}
                onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map((p) => p.id)))}
              />
            </th>
            {COLUMNS.map((c) => (
              <th key={c.key} className={c.className} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className={styles.sortBtn} onClick={() => toggleSort(c.key)}>
                  {c.label === '★' ? c.label : t(c.label)}
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
                  <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} aria-label={t('expand.select', { title: p.title })} />
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
                      {p.tags.map((tag) => (
                        <span key={tag} className={styles.tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className={styles.colNum}>{p.citationCount?.toLocaleString() ?? '—'}</td>
                <td className={styles.colStatus}>
                  <span className={styles.status} style={{ color: status?.color }}>
                    <span className={styles.dot} style={{ background: status?.color }} />
                    {status && t(status.label)}
                  </span>
                </td>
                <td className={styles.colNum}>{p.rating ? p.rating : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div className={styles.empty}>{t('library.empty')}</div>}
    </div>
  );
}
