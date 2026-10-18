import type { Paper } from '../../types';
import { useApiHealth } from '../../hooks/useApiHealth';
import { useSettings } from '../../hooks/settingsContext';
import { useStream } from '../../hooks/useStream';
import { MiniMarkdown } from '../common/MiniMarkdown';
import { useT } from '../../hooks/useT';
import styles from './DetailPanel.module.css';

interface SummarySectionProps {
  paper: Paper;
  onAppendNotes: (text: string) => void;
}

export function SummarySection({ paper, onAppendNotes }: SummarySectionProps) {
  const health = useApiHealth();
  const { settings } = useSettings();
  const t = useT();
  const llmEnabled = health.status === 'ok' && health.health.llm.enabled && settings.useLlm;
  const summary = useStream('/api/llm/summarize');
  const translation = useStream('/api/llm/translate');
  const body = { paper, lang: settings.aiLanguage, useLlm: settings.useLlm };
  const busy = summary.state.status === 'streaming' || translation.state.status === 'streaming';

  const result = (s: ReturnType<typeof useStream>['state'], label: string) => {
    if (s.status === 'idle') return null;
    return (
      <div className={styles.aiResult}>
        <div className={styles.aiHeader}>
          <span>{label}</span>
          {s.status === 'done' && (
            <span className={s.mode === 'llm' ? styles.aiBadge : styles.aiBadgeMuted}>{s.mode === 'llm' ? t('ai.llm') : t('ai.extractive')}</span>
          )}
          {s.status === 'streaming' && <span className={styles.aiBadgeMuted}>{t('ai.generating')}</span>}
        </div>
        {s.text && <MiniMarkdown text={s.text} className={styles.aiText} />}
        {s.status === 'error' && <div className={styles.errorNote}>{s.message}</div>}
        {s.status === 'done' && (
          <button type="button" className={styles.refLink} onClick={() => onAppendNotes(`【${label}】\n${s.text}`)}>
            {t('ai.appendNotes')}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionLabel}>{t('ai.title')}</div>
      <div className={styles.expandButtons}>
        <button type="button" className={styles.expandBtn} disabled={busy || !paper.abstract} onClick={() => summary.run(body)}>
          {t('ai.summarize')}
        </button>
        <button
          type="button"
          className={styles.expandBtn}
          disabled={busy || !paper.abstract || !llmEnabled}
          title={llmEnabled ? t('ai.translateTitle', { lang: t(`ai.lang.${settings.aiLanguage}`) }) : t('ai.needsKey')}
          onClick={() => translation.run(body)}
        >
          {t('ai.translate')}
        </button>
      </div>
      {!paper.abstract && <div className={styles.emptyNote}>{t('ai.noAbstract')}</div>}
      {result(summary.state, t('ai.summary'))}
      {result(translation.state, t('ai.translation'))}
    </div>
  );
}
