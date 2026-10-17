import type { ReactNode } from 'react';
import type { Paper, SidebarMode } from '../../types';
import { PaperForm } from '../PaperForm/PaperForm';
import styles from './Sidebar.module.css';

interface SidebarProps {
  mode: SidebarMode;
  selectedPaper: Paper | null;
  allPapers: Paper[];
  onSubmit: (paper: Paper) => void;
  onClose: () => void;
  /** Kept mounted while hidden so the search form and results survive closing the panel. */
  searchPanel: ReactNode;
}

const TITLES: Record<SidebarMode, string> = {
  closed: '',
  search: 'Search papers',
  add: 'Add Paper',
  edit: 'Edit Paper',
};

export function Sidebar({ mode, selectedPaper, allPapers, onSubmit, onClose, searchPanel }: SidebarProps) {
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
        {isForm && (
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
