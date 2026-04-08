import styles from './Toolbar.module.css';

interface ToolbarProps {
  layoutDirection: 'TB' | 'LR';
  onAutoLayout: () => void;
  onAddPaper: () => void;
  onFitView: () => void;
  onToggleDirection: () => void;
}

export function Toolbar({
  layoutDirection,
  onAutoLayout,
  onAddPaper,
  onFitView,
  onToggleDirection,
}: ToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <button className={styles.btn} onClick={onAddPaper}>
        + Add Paper
      </button>
      <div className={styles.separator} />
      <button className={styles.btn} onClick={onAutoLayout}>
        Auto Layout
      </button>
      <button className={styles.btn} onClick={onToggleDirection}>
        {layoutDirection === 'LR' ? 'Left→Right' : 'Top→Bottom'}
      </button>
      <div className={styles.separator} />
      <button className={styles.btn} onClick={onFitView}>
        Fit View
      </button>
    </div>
  );
}
