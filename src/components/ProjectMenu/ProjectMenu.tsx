import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ProjectSummary } from '../../store/projects';
import type { ExportFormat, NotesFormat } from '../../utils/bibliography';
import { useT } from '../../hooks/useT';
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
  onExportNotes: (format: NotesFormat) => void;
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
  onExportNotes,
  onImportBibliography,
  onExportImage,
  extra,
}: ProjectMenuProps) {
  const t = useT();
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
      setBibNote(n > 0 ? t('project.bibAdded', { n }) : t('project.bibNone'));
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
    if (window.confirm(t('project.confirmDelete', { name: activeName }))) {
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
            <span className={styles.sectionLabel}>{t('project.name')}</span>
            <input
              key={activeId}
              className={styles.nameInput}
              defaultValue={activeName}
              onBlur={(e) => onRename(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>

          <div className={styles.sectionLabel}>{t('project.list')}</div>
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
                    {t('project.meta', { n: p.paperCount, date: formatDate(p.updatedAt) })}
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
              {t('project.new')}
            </button>
            <button className={styles.action} onClick={onExport}>
              {t('project.exportJson')}
            </button>
            <button className={styles.action} onClick={() => fileRef.current?.click()}>
              {t('project.importJson')}
            </button>
            <button className={`${styles.action} ${styles.danger}`} onClick={handleDelete}>
              {t('project.delete')}
            </button>
          </div>
          <div className={styles.sectionLabel}>{t('project.references')}</div>
          <div className={styles.actions3}>
            {(['bib', 'ris', 'csv'] as const).map((f) => (
              <button key={f} className={styles.action} onClick={() => onExportBibliography(f)}>
                {t('project.export', { ext: f })}
              </button>
            ))}
            <button className={`${styles.action} ${styles.wide}`} onClick={() => bibRef.current?.click()}>
              {t('project.importBib')}
            </button>
          </div>
          {bibNote && <div className={styles.note}>{bibNote}</div>}
          <div className={styles.sectionLabel}>{t('project.notes')}</div>
          <div className={styles.actions}>
            <button className={styles.action} onClick={() => onExportNotes('md')}>
              {t('project.notesMd')}
            </button>
            <button className={styles.action} title={t('project.notesObsidianTitle')} onClick={() => onExportNotes('obsidian')}>
              {t('project.notesObsidian')}
            </button>
          </div>
          <div className={styles.sectionLabel}>{t('project.image')}</div>
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
                {t('project.export', { ext: f })}
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
