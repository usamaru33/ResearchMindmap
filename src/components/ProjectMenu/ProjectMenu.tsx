import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ProjectSummary } from '../../store/projects';
import type { ExportFormat } from '../../utils/bibliography';
import styles from './ProjectMenu.module.css';

interface ProjectMenuProps {
  activeId: string;
  activeName: string;
  projects: ProjectSummary[];
  saveError: string | null;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  onExportBibliography: (format: ExportFormat) => void;
  /** Resolves with the number of papers added. */
  onImportBibliography: (file: File) => Promise<number>;
  onExportImage: (format: 'png' | 'svg') => Promise<void>;
  /** Controls shown next to the project button (undo/redo, help). */
  extra?: ReactNode;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export function ProjectMenu({
  activeId,
  activeName,
  projects,
  saveError,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
  onExport,
  onImport,
  onExportBibliography,
  onImportBibliography,
  onExportImage,
  extra,
}: ProjectMenuProps) {
  const [open, setOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bibRef = useRef<HTMLInputElement>(null);
  const [bibNote, setBibNote] = useState<string | null>(null);

  const handleBibFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const n = await onImportBibliography(file);
      setBibNote(n > 0 ? `${n} 件の論文を追加しました` : '論文を読み取れませんでした（BibTeX か RIS を選んでください）');
    } catch (err) {
      setBibNote((err as Error).message);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await onImport(file);
      setImportError(null);
      setOpen(false);
    } catch (err) {
      setImportError((err as Error).message);
    }
  };

  const handleDelete = () => {
    if (window.confirm(`「${activeName}」を削除します。元に戻せません。よろしいですか？`)) {
      onDelete();
      setOpen(false);
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.row}>
        <button
          className={styles.trigger}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className={styles.triggerLabel}>{activeName}</span>
          <span aria-hidden>▾</span>
        </button>
        {extra}
      </div>
      {saveError && (
        <div className={styles.warning} role="alert">
          {saveError}
        </div>
      )}

      {open && (
        <div className={styles.menu} role="menu">
          <label className={styles.nameField}>
            <span className={styles.sectionLabel}>Project name</span>
            <input
              key={activeId}
              className={styles.nameInput}
              defaultValue={activeName}
              onBlur={(e) => onRename(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>

          <div className={styles.sectionLabel}>Projects</div>
          <ul className={styles.list}>
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  className={`${styles.item} ${p.id === activeId ? styles.itemActive : ''}`}
                  onClick={() => {
                    onSwitch(p.id);
                    setOpen(false);
                  }}
                >
                  <span className={styles.itemName}>{p.name}</span>
                  <span className={styles.itemMeta}>
                    {p.paperCount} papers · {formatDate(p.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className={styles.actions}>
            <button
              className={styles.action}
              onClick={() => {
                onCreate();
                setOpen(false);
              }}
            >
              + New project
            </button>
            <button className={styles.action} onClick={onExport}>
              Export JSON
            </button>
            <button className={styles.action} onClick={() => fileRef.current?.click()}>
              Import JSON
            </button>
            <button className={`${styles.action} ${styles.danger}`} onClick={handleDelete}>
              Delete
            </button>
          </div>
          <div className={styles.sectionLabel}>References</div>
          <div className={styles.actions3}>
            {(['bib', 'ris', 'csv'] as const).map((f) => (
              <button key={f} className={styles.action} onClick={() => onExportBibliography(f)}>
                Export .{f}
              </button>
            ))}
            <button className={`${styles.action} ${styles.wide}`} onClick={() => bibRef.current?.click()}>
              Import .bib / .ris
            </button>
          </div>
          {bibNote && <div className={styles.note}>{bibNote}</div>}
          <div className={styles.sectionLabel}>Image</div>
          <div className={styles.actions}>
            {(['png', 'svg'] as const).map((f) => (
              <button
                key={f}
                className={styles.action}
                onClick={async () => {
                  setBibNote(null);
                  try {
                    await onExportImage(f);
                  } catch (err) {
                    setBibNote((err as Error).message);
                  }
                }}
              >
                Export .{f}
              </button>
            ))}
          </div>
          <input ref={bibRef} type="file" accept=".bib,.ris,.txt,.bibtex" hidden onChange={handleBibFile} />
          {importError && (
            <div className={styles.warning} role="alert">
              {importError}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={handleFile}
          />
        </div>
      )}
    </div>
  );
}
