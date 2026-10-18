import { useState } from 'react';
import type { GapsResponse } from '../../../shared/types';
import { gapsToMarkdown } from '../../utils/gapsMarkdown';
import type { Paper } from '../../types';
import type { PaperGroup } from '../../store/groups';
import { apiPost } from '../../api/client';
import { useT } from '../../hooks/useT';
import styles from './WritingPanel.module.css';

interface GapsViewProps {
  papers: Paper[];
  groups: PaperGroup[];
  topic: string;
  lang: 'ja' | 'en';
  useLlm: boolean;
  onFocusPaper: (id: string) => void;
}

export function GapsView({ papers, groups, topic, lang, useLlm, onFocusPaper }: GapsViewProps) {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GapsResponse | null>(null);
  const titleOf = (id: string) => papers.find((p) => p.id === id)?.title ?? id;

  const analyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = new Set(papers.map((p) => p.id));
      setResult(
        await apiPost<GapsResponse>('/api/llm/gaps', {
          papers: papers.slice(0, 80),
          groups: groups.map((g) => ({ label: g.label, paperIds: g.paperIds.filter((id) => ids.has(id)) })),
          topic,
          lang,
          useLlm,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button type="button" className={styles.primary} onClick={analyze} disabled={loading || papers.length === 0}>
        {loading ? t('gaps.analyzing') : useLlm ? t('gaps.find') : t('gaps.collect')}
      </button>
      {error && <div className={styles.error}>{error}</div>}
      {result && (
        <div className={styles.output}>
          <div className={styles.outputHeader}>
            <span className={result.mode === 'llm' ? styles.badge : styles.badgeMuted}>
              {result.mode === 'llm' ? t('gaps.badgeLlm', { n: result.gaps.length }) : t('gaps.badgeFallback')}
            </span>
            <span className={styles.outputActions}>
              <button
                type="button"
                className={styles.link}
                onClick={() => navigator.clipboard.writeText(gapsToMarkdown(result.gaps, titleOf)).catch(() => undefined)}
              >
                {t('write.copyMd')}
              </button>
            </span>
          </div>
          {result.warnings.map((w) => (
            <div key={w} className={styles.hint}>
              {w}
            </div>
          ))}
          {result.gaps.length === 0 && <div className={styles.hint}>{t('gaps.none')}</div>}
          {result.gaps.map((g, i) => (
            <section key={i} className={styles.gap}>
              <h4>{g.title}</h4>
              <p>{g.description}</p>
              <ul className={styles.evidence}>
                {g.evidence.map((e, k) => (
                  <li key={k}>
                    <q>{e.quote}</q>{' '}
                    <button type="button" className={styles.link} onClick={() => onFocusPaper(e.paperId)}>
                      {titleOf(e.paperId)}
                    </button>
                  </li>
                ))}
              </ul>
              {g.questions.length > 0 && (
                <div className={styles.questions}>
                  <span>{t('gaps.questions')}</span>
                  <ul>
                    {g.questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
