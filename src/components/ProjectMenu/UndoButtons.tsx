import styles from './ProjectMenu.module.css';

interface UndoButtonsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onHelp: () => void;
  onSettings: () => void;
}

export function UndoButtons({ canUndo, canRedo, onUndo, onRedo, onHelp, onSettings }: UndoButtonsProps) {
  return (
    <>
      <button type="button" className={styles.iconBtn} onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="元に戻す (Ctrl+Z)">
        ↶
      </button>
      <button type="button" className={styles.iconBtn} onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="やり直す (Ctrl+Shift+Z)">
        ↷
      </button>
      <button type="button" className={styles.iconBtn} onClick={onHelp} aria-label="Keyboard shortcuts" title="ショートカット (?)">
        ?
      </button>
      <button type="button" className={styles.iconBtn} onClick={onSettings} aria-label="Settings" title="設定">
        ⚙
      </button>
    </>
  );
}
