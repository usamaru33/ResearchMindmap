import { SHORTCUTS } from '../../hooks/useShortcuts';
import styles from './ShortcutHelp.module.css';

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.dialog} role="dialog" aria-label="Keyboard shortcuts">
        <div className={styles.header}>
          <h3>Keyboard shortcuts</h3>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
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
                <td>{s.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
