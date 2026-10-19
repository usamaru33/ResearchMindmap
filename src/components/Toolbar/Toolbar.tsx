import type { ReactNode } from 'react';
import type { LayoutDirection } from '../../types';
import { useApiHealth } from '../../hooks/useApiHealth';
import { localizedReason } from '../../i18n/localized';
import { useT } from '../../hooks/useT';
import styles from './Toolbar.module.css';

/** Map operations only; the features live in the feature menu (DESIGN 14.2). */
interface ToolbarProps {
  layoutDirection: LayoutDirection;
  onAutoLayout: () => void;
  onFitView: () => void;
  onToggleDirection: () => void;
  onAddNote: () => void;
  showCitations: boolean;
  onToggleCitations: () => void;
  viewMenu: ReactNode;
  timelineOn: boolean;
  onToggleTimeline: () => void;
}

export function Toolbar({
  layoutDirection,
  onAutoLayout,
  onFitView,
  onToggleDirection,
  onAddNote,
  showCitations,
  onToggleCitations,
  viewMenu,
  timelineOn,
  onToggleTimeline,
}: ToolbarProps) {
  const apiHealth = useApiHealth();
  const t = useT();
  const apiTitle =
    apiHealth.status === 'ok'
      ? `API v${apiHealth.health.version}`
      : apiHealth.status === 'error'
        ? apiHealth.message
        : t('toolbar.connecting');
  const llmOn = apiHealth.status === 'ok' && apiHealth.health.llm.enabled;
  const llmTitle =
    apiHealth.status === 'ok'
      ? llmOn
        ? t('toolbar.llmOn', { model: apiHealth.health.llm.model ?? '' })
        : t('toolbar.llmOff', { reason: localizedReason(apiHealth.health.llm, t.lang) ?? '' })
      : t('toolbar.llmUnknown');

  return (
    <div className={styles.toolbar} role="toolbar" aria-label={t('toolbar.label')}>
      <button className={styles.btn} onClick={onAddNote} title={t('toolbar.noteTitle')}>
        {t('toolbar.note')}
      </button>
      <div className={styles.separator} />
      <button className={styles.btn} onClick={onAutoLayout}>
        {t('toolbar.autoLayout')}
      </button>
      <button className={styles.btn} onClick={onToggleDirection}>
        {layoutDirection === 'LR' ? t('toolbar.leftRight') : t('toolbar.topBottom')}
      </button>
      <div className={styles.separator} />
      <button
        className={`${styles.btn} ${timelineOn ? styles.btnActive : ''}`}
        onClick={onToggleTimeline}
        aria-pressed={timelineOn}
        title={t('toolbar.timelineTitle')}
      >
        {t('toolbar.timeline')}
      </button>
      {viewMenu}
      <button
        className={`${styles.btn} ${showCitations ? '' : styles.btnOff}`}
        onClick={onToggleCitations}
        aria-pressed={showCitations}
        title={t('toolbar.citationsTitle')}
      >
        {t('toolbar.citations')}
      </button>
      <button className={styles.btn} onClick={onFitView}>
        {t('toolbar.fitView')}
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
