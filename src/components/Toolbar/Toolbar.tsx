import type { ReactNode } from 'react';
import type { LayoutDirection } from '../../types';
import { useApiHealth } from '../../hooks/useApiHealth';
import { localizedReason } from '../../i18n/localized';
import { useT } from '../../hooks/useT';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  layoutDirection: LayoutDirection;
  onAutoLayout: () => void;
  onAddPaper: () => void;
  onFitView: () => void;
  onToggleDirection: () => void;
  onToggleSearch: () => void;
  searchOpen: boolean;
  searchBadge: number;
  onToggleLibrary: () => void;
  libraryOpen: boolean;
  onToggleWrite: () => void;
  writeOpen: boolean;
  onToggleCompare: () => void;
  compareOpen: boolean;
  onToggleScreen: () => void;
  screenOpen: boolean;
  onToggleAnalyze: () => void;
  analyzeOpen: boolean;
  showCitations: boolean;
  onToggleCitations: () => void;
  viewMenu: ReactNode;
  timelineOn: boolean;
  onToggleTimeline: () => void;
}

export function Toolbar({
  layoutDirection,
  onAutoLayout,
  onAddPaper,
  onFitView,
  onToggleDirection,
  onToggleSearch,
  searchOpen,
  searchBadge,
  onToggleLibrary,
  libraryOpen,
  onToggleWrite,
  writeOpen,
  onToggleCompare,
  compareOpen,
  onToggleScreen,
  screenOpen,
  onToggleAnalyze,
  analyzeOpen,
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
    <div className={styles.toolbar}>
      <button
        className={`${styles.btn} ${searchOpen ? styles.btnActive : ''}`}
        onClick={onToggleSearch}
        aria-pressed={searchOpen}
        title={searchBadge > 0 ? t('alerts.badge', { n: searchBadge }) : undefined}
      >
        {t('toolbar.search')}
        {searchBadge > 0 && <span className={styles.badge}>{searchBadge}</span>}
      </button>
      <button
        className={`${styles.btn} ${libraryOpen ? styles.btnActive : ''}`}
        onClick={onToggleLibrary}
        aria-pressed={libraryOpen}
      >
        {t('toolbar.library')}
      </button>
      <button
        className={`${styles.btn} ${writeOpen ? styles.btnActive : ''}`}
        onClick={onToggleWrite}
        aria-pressed={writeOpen}
        title={t('toolbar.writeTitle')}
      >
        {t('toolbar.write')}
      </button>
      <button
        className={`${styles.btn} ${compareOpen ? styles.btnActive : ''}`}
        onClick={onToggleCompare}
        aria-pressed={compareOpen}
        title={t('toolbar.compareTitle')}
      >
        {t('toolbar.compare')}
      </button>
      <button
        className={`${styles.btn} ${screenOpen ? styles.btnActive : ''}`}
        onClick={onToggleScreen}
        aria-pressed={screenOpen}
        title={t('toolbar.screenTitle')}
      >
        {t('toolbar.screen')}
      </button>
      <button
        className={`${styles.btn} ${analyzeOpen ? styles.btnActive : ''}`}
        onClick={onToggleAnalyze}
        aria-pressed={analyzeOpen}
        title={t('toolbar.analyzeTitle')}
      >
        {t('toolbar.analyze')}
      </button>
      <button className={styles.btn} onClick={onAddPaper}>
        {t('toolbar.addPaper')}
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
