import { useState, type ReactNode } from 'react';
import type { Paper, SidebarMode } from '../../types';
import { PaperForm } from '../PaperForm/PaperForm';
import { IdentifierImport } from './IdentifierImport';
import styles from './Sidebar.module.css';

interface SidebarProps {
  mode: SidebarMode;
  selectedPaper: Paper | null;
  allPapers: Paper[];
  onSubmit: (paper: Paper) => void;
  onClose: () => void;
  /** Kept mounted while hidden so the search form and results survive closing the panel. */
  searchPanel: ReactNode;
  mapIds: Set<string>;
  onAddPapers: (papers: Paper[]) => void;
}

const TITLES: Record<SidebarMode, string> = {
  closed: '',
  search: 'Search papers',
  add: 'Add Paper',
  edit: 'Edit Paper',
};

export function Sidebar({ mode, selectedPaper, allPapers, onSubmit, onClose, searchPanel, mapIds, onAddPapers }: SidebarProps) {
  const [addTab, setAddTab] = useState<'identifiers' | 'manual'>('identifiers');
  const isOpen = mode !== 'closed';
  const isForm = mode === 'add' || mode === 'edit';

  return (
    <div
      className={`${styles.sidebar} ${mode === 'search' ? styles.sidebarWide : ''} ${!isOpen ? styles.sidebarClosed : ''}`}
      aria-hidden={!isOpen}
    >
      <div className={styles.header}>
        <span className={styles.headerTitle}>{TITLES[mode]}</span>
        <button className={styles.closeBtn} onClick={onClose}>
          &times;
        </button>
      </div>
      <div className={styles.body}>
        <div hidden={mode !== 'search'}>{searchPanel}</div>
        {mode === 'add' && (
          <div className={styles.addTabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={addTab === 'identifiers'}
              className={`${styles.addTab} ${addTab === 'identifiers' ? styles.addTabActive : ''}`}
              onClick={() => setAddTab('identifiers')}
            >
              From identifiers
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={addTab === 'manual'}
              className={`${styles.addTab} ${addTab === 'manual' ? styles.addTabActive : ''}`}
              onClick={() => setAddTab('manual')}
            >
              Manual
            </button>
          </div>
        )}
        {mode === 'add' && addTab === 'identifiers' && <IdentifierImport mapIds={mapIds} onAdd={onAddPapers} />}
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
