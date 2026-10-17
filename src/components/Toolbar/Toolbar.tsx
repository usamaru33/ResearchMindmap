import type { LayoutDirection } from '../../types';
import { useApiHealth } from '../../hooks/useApiHealth';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  layoutDirection: LayoutDirection;
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
  const apiHealth = useApiHealth();
  const apiTitle =
    apiHealth.status === 'ok'
      ? `API v${apiHealth.health.version}`
      : apiHealth.status === 'error'
        ? apiHealth.message
        : 'Connecting…';
  const llmOn = apiHealth.status === 'ok' && apiHealth.health.llm.enabled;
  const llmTitle =
    apiHealth.status === 'ok'
      ? llmOn
        ? `LLM: ${apiHealth.health.llm.model}`
        : `LLM off: ${apiHealth.health.llm.reason ?? ''}`
      : 'LLM status unknown';

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
      <div className={styles.separator} />
      <span className={styles.status} title={apiTitle}>
        <span className={`${styles.dot} ${styles[`dot_${apiHealth.status}`]}`} />
        API
      </span>
      <span className={styles.status} title={llmTitle}>
        <span className={`${styles.dot} ${llmOn ? styles.dot_ok : styles.dot_off}`} />
        LLM
      </span>
    </div>
  );
}
