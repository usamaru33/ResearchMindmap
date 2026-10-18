import { Suspense, useState, type ReactNode } from 'react';
import type { Paper, SidebarMode } from '../../types';
import { PaperForm } from '../PaperForm/PaperForm';
import { IdentifierImport } from './IdentifierImport';
import { useT } from '../../hooks/useT';
import type { MessageKey } from '../../i18n';
import styles from './Sidebar.module.css';

interface SidebarProps {
  mode: SidebarMode;
  selectedPaper: Paper | null;
  allPapers: Paper[];
  onSubmit: (paper: Paper) => void;
  onClose: () => void;
  /** Kept mounted while hidden so the search form and results survive closing the panel. */
  searchPanel: ReactNode;
  libraryPanel: ReactNode;
  writingPanel: ReactNode;
  comparePanel: ReactNode;
  screeningPanel: ReactNode;
  mapIds: Set<string>;
  onAddPapers: (papers: Paper[]) => void;
}

const TITLES: Record<Exclude<SidebarMode, 'closed'>, MessageKey> = {
  search: 'sidebar.search',
  library: 'sidebar.library',
  write: 'sidebar.write',
  compare: 'sidebar.compare',
  screen: 'sidebar.screen',
  add: 'sidebar.add',
  edit: 'sidebar.edit',
};

export function Sidebar({ mode, selectedPaper, allPapers, onSubmit, onClose, searchPanel, libraryPanel, writingPanel, comparePanel, screeningPanel, mapIds, onAddPapers }: SidebarProps) {
  const t = useT();
  const [addTab, setAddTab] = useState<'identifiers' | 'references' | 'manual'>('identifiers');
  const isOpen = mode !== 'closed';
  const isForm = mode === 'add' || mode === 'edit';

  return (
    <div
      className={`${styles.sidebar} ${mode === 'compare' ? styles.sidebarXWide : mode === 'search' || mode === 'library' || mode === 'write' || mode === 'screen' ? styles.sidebarWide : ''} ${!isOpen ? styles.sidebarClosed : ''}`}
      aria-hidden={!isOpen}
    >
      <div className={styles.header}>
        <span className={styles.headerTitle}>{mode === 'closed' ? '' : t(TITLES[mode])}</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label={t('sidebar.close')}>
          &times;
        </button>
      </div>
      <div className={styles.body}>
        <div hidden={mode !== 'search'}>{searchPanel}</div>
        <Suspense fallback={<div className={styles.loading}>{t('sidebar.loading')}</div>}>
          {mode === 'library' && libraryPanel}
          {mode === 'write' && writingPanel}
          {mode === 'compare' && comparePanel}
          {mode === 'screen' && screeningPanel}
        </Suspense>
        {mode === 'add' && (
          <div className={styles.addTabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={addTab === 'identifiers'}
              className={`${styles.addTab} ${addTab === 'identifiers' ? styles.addTabActive : ''}`}
              onClick={() => setAddTab('identifiers')}
            >
              {t('sidebar.fromIds')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={addTab === 'references'}
              className={`${styles.addTab} ${addTab === 'references' ? styles.addTabActive : ''}`}
              onClick={() => setAddTab('references')}
            >
              {t('sidebar.fromReferences')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={addTab === 'manual'}
              className={`${styles.addTab} ${addTab === 'manual' ? styles.addTabActive : ''}`}
              onClick={() => setAddTab('manual')}
            >
              {t('sidebar.manual')}
            </button>
          </div>
        )}
        {mode === 'add' && addTab !== 'manual' && (
          <IdentifierImport key={addTab} mode={addTab} mapIds={mapIds} onAdd={onAddPapers} />
        )}
        {isForm && (mode === 'edit' || addTab === 'manual') && (
          <PaperForm
            key={mode === 'edit' ? selectedPaper?.id : 'new'}
            paper={mode === 'edit' ? selectedPaper : null}
            allPapers={allPapers}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  );
}
