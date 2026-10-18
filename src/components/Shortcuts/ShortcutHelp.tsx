import { SHORTCUTS } from '../../hooks/useShortcuts';
import { useT } from '../../hooks/useT';
import styles from './ShortcutHelp.module.css';

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.dialog} role="dialog" aria-label={t('shortcuts.title')}>
        <div className={styles.header}>
          <h3>{t('shortcuts.title')}</h3>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        <table>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <td>
                  <kbd>{s.keys}</kbd>
                </td>
                <td>{t(s.label)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
