import type { Paper } from '../../types';
import { useApiHealth } from '../../hooks/useApiHealth';
import { useStream } from '../../hooks/useStream';
import { MiniMarkdown } from '../common/MiniMarkdown';
import styles from './DetailPanel.module.css';

interface SummarySectionProps {
  paper: Paper;
  onAppendNotes: (text: string) => void;
}

export function SummarySection({ paper, onAppendNotes }: SummarySectionProps) {
  const health = useApiHealth();
  const llmEnabled = health.status === 'ok' && health.health.llm.enabled;
  const summary = useStream('/api/llm/summarize');
  const translation = useStream('/api/llm/translate');
  const body = { paper, lang: 'ja' };
  const busy = summary.state.status === 'streaming' || translation.state.status === 'streaming';

  const result = (s: ReturnType<typeof useStream>['state'], label: string) => {
    if (s.status === 'idle') return null;
    return (
      <div className={styles.aiResult}>
        <div className={styles.aiHeader}>
          <span>{label}</span>
          {s.status === 'done' && (
            <span className={s.mode === 'llm' ? styles.aiBadge : styles.aiBadgeMuted}>{s.mode === 'llm' ? 'LLM' : '抜き出し（LLM なし）'}</span>
          )}
          {s.status === 'streaming' && <span className={styles.aiBadgeMuted}>生成中…</span>}
        </div>
        {s.text && <MiniMarkdown text={s.text} className={styles.aiText} />}
        {s.status === 'error' && <div className={styles.errorNote}>{s.message}</div>}
        {s.status === 'done' && (
          <button type="button" className={styles.refLink} onClick={() => onAppendNotes(`【${label}】\n${s.text}`)}>
            メモに追加
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionLabel}>AI assist</div>
      <div className={styles.expandButtons}>
        <button type="button" className={styles.expandBtn} disabled={busy || !paper.abstract} onClick={() => summary.run(body)}>
          要約
        </button>
        <button
          type="button"
          className={styles.expandBtn}
          disabled={busy || !paper.abstract || !llmEnabled}
          title={llmEnabled ? '抄録を日本語に翻訳' : 'ANTHROPIC_API_KEY が必要です'}
          onClick={() => translation.run(body)}
        >
          抄録を翻訳
        </button>
      </div>
      {!paper.abstract && <div className={styles.emptyNote}>抄録がないため使えません</div>}
      {result(summary.state, '要約')}
      {result(translation.state, '翻訳')}
    </div>
  );
}
