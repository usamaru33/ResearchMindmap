import type { Paper, SidebarMode } from '../../types';
import { PaperForm } from '../PaperForm/PaperForm';
import styles from './Sidebar.module.css';

interface SidebarProps {
  mode: SidebarMode;
  selectedPaper: Paper | null;
  allPapers: Paper[];
  onSubmit: (paper: Paper) => void;
  onClose: () => void;
}

export function Sidebar({ mode, selectedPaper, allPapers, onSubmit, onClose }: SidebarProps) {
  const isOpen = mode !== 'closed';
  const title = mode === 'add' ? 'Add Paper' : 'Edit Paper';

  return (
    <div className={`${styles.sidebar} ${!isOpen ? styles.sidebarClosed : ''}`}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>{title}</span>
        <button className={styles.closeBtn} onClick={onClose}>
          &times;
        </button>
      </div>
      <div className={styles.body}>
        {isOpen && (
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
