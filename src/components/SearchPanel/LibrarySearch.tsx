import { useDeferredValue, useMemo, useState } from 'react';
import type { Paper } from '../../types';
import type { ProjectSummary } from '../../store/projects';
import { paperForCopy, searchLibrary, type LibrarySource } from '../../store/librarySearch';
import { truncateAuthors } from '../../utils/helpers';
import { useT } from '../../hooks/useT';
import styles from './SearchPanel.module.css';

const PAGE = 100;

interface LibrarySearchProps {
  /** Only load and search while the scope is shown. */
  active: boolean;
  projects: ProjectSummary[];
  activeId: string;
  activeName: string;
  currentPapers: Paper[];
  loadPapers: (projectId: string) => Paper[];
  onFocus: (paperId: string) => void;
  onAdd: (papers: Paper[]) => void;
  onOpenProject: (projectId: string) => void;
}

/** Search the papers of the user's own saved projects (DESIGN 14.3). Nothing is sent to the databases. */
export function LibrarySearch({ active, projects, activeId, activeName, currentPapers, loadPapers, onFocus, onAdd, onOpenProject }: LibrarySearchProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [onlyProject, setOnlyProject] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const deferred = useDeferredValue(query);

  // Other projects are read from storage again only when the list of projects changes.
  const others = useMemo<LibrarySource[]>(
    () =>
      active
        ? projects
            .filter((p) => p.id !== activeId)
            .map((p) => ({ projectId: p.id, projectName: p.name, current: false, papers: loadPapers(p.id) }))
        : [],
    [active, projects, activeId, loadPapers],
  );
  const hits = useMemo(
    () =>
      active
        ? searchLibrary([{ projectId: activeId, projectName: activeName, current: true, papers: currentPapers }, ...others], deferred, onlyProject || undefined)
        : [],
    [active, activeId, activeName, currentPapers, others, deferred, onlyProject],
  );
  const addable = hits.filter((h) => !h.inCurrent);
  const picked = addable.filter((h) => chosen.has(h.paper.id));
  const projectCount = new Set(hits.flatMap((h) => h.projects.map((p) => p.id))).size;

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const add = () => {
    onAdd(picked.map((h) => paperForCopy(h.paper)));
    setChosen(new Set());
  };

  return (
    <div className={styles.panel}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="library-search-input">
          {t('mine.label')}
        </label>
        <input
          id="library-search-input"
          className={styles.input}
          type="search"
          value={query}
          placeholder={t('mine.placeholder')}
          aria-describedby="library-search-hint"
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
        />
        <span id="library-search-hint" className={styles.muted}>
          {t('mine.hint')}
        </span>
      </div>
      <label className={styles.inlineSelect}>
        {t('mine.project')}
        <select value={onlyProject} onChange={(e) => setOnlyProject(e.target.value)}>
          <option value="">{t('mine.allProjects', { n: projects.length || 1 })}</option>
          {[{ id: activeId, name: activeName }, ...projects.filter((p) => p.id !== activeId)].map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === activeId ? t('mine.thisMap', { name: p.name }) : p.name}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.mineBar}>
        <span className={styles.summary} role="status">
          {t('mine.count', { n: hits.length, projects: projectCount })}
        </span>
        <button type="button" className={styles.searchBtn} onClick={add} disabled={picked.length === 0}>
          {t('mine.add', { n: picked.length })}
        </button>
      </div>

      {hits.length === 0 ? (
        <div className={styles.muted}>{query.trim() ? t('mine.none') : t('mine.empty')}</div>
      ) : (
        <ul className={styles.mineList}>
          {hits.slice(0, shown).map((h) => {
            const p = h.paper;
            const other = h.projects.find((x) => !x.current);
            return (
              <li key={`${h.projects[0].id}:${p.id}`} className={styles.mineItem}>
                {h.inCurrent ? (
                  <span className={styles.mineInMap}>{t('mine.inMap')}</span>
                ) : (
                  <input
                    type="checkbox"
                    checked={chosen.has(p.id)}
                    onChange={() => toggle(p.id)}
                    aria-label={t('mine.choose', { title: p.title })}
                  />
                )}
                <div className={styles.mineBody}>
                  {h.inCurrent ? (
                    <button type="button" className={styles.mineTitle} onClick={() => onFocus(p.id)} title={t('mine.showInMap')}>
                      {p.title}
                    </button>
                  ) : (
                    <span className={styles.mineTitle}>{p.title}</span>
                  )}
                  <div className={styles.mineMeta}>
                    {[p.year || null, truncateAuthors(p.authors, 3), p.venue].filter(Boolean).join(' · ')}
                  </div>
                  <div className={styles.mineProjects}>
                    {h.projects.map((x) => (
                      <span key={x.id} className={`${styles.mineProject} ${x.current ? styles.mineProjectCurrent : ''}`}>
                        {x.current ? t('mine.thisMapShort') : x.name}
                      </span>
                    ))}
                    {(p.tags ?? []).map((tag) => (
                      <span key={tag} className={styles.mineTag}>
                        #{tag}
                      </span>
                    ))}
                    {other && !h.inCurrent && (
                      <button type="button" className={styles.linkBtn} onClick={() => onOpenProject(other.id)}>
                        {t('mine.open', { name: other.name })}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hits.length > shown && (
        <button type="button" className={styles.linkBtn} onClick={() => setShown((n) => n + PAGE)}>
          {t('mine.more', { n: Math.min(PAGE, hits.length - shown) })}
        </button>
      )}
    </div>
  );
}
