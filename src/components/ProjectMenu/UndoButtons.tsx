import { useT } from '../../hooks/useT';
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
  const t = useT();
  return (
    <>
      <button type="button" className={styles.iconBtn} onClick={onUndo} disabled={!canUndo} aria-label={t('shortcuts.undo')} title={t('undo.undo')}>
        ↶
      </button>
      <button type="button" className={styles.iconBtn} onClick={onRedo} disabled={!canRedo} aria-label={t('shortcuts.redo')} title={t('undo.redo')}>
        ↷
      </button>
      <button type="button" className={styles.iconBtn} onClick={onHelp} aria-label={t('shortcuts.title')} title={t('undo.help')}>
        ?
      </button>
      <button type="button" className={styles.iconBtn} onClick={onSettings} aria-label={t('undo.settings')} title={t('undo.settings')}>
        ⚙
      </button>
    </>
  );
}
