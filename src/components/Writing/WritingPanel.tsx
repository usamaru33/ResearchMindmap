import { useMemo, useState } from 'react';
import { toBibtex } from '../../../shared/biblio/bibtex';
import type { Paper } from '../../types';
import type { PaperGroup } from '../../store/groups';
import { useApiHealth } from '../../hooks/useApiHealth';
import { useT } from '../../hooks/useT';
import { useSettings } from '../../hooks/settingsContext';
import { useStream } from '../../hooks/useStream';
import { downloadText, safeFileName } from '../../utils/download';
import { MiniMarkdown } from '../common/MiniMarkdown';
import { CitationCheck } from './CitationCheck';
import { GapsView } from './GapsView';
import styles from './WritingPanel.module.css';

interface WritingPanelProps {
  papers: Paper[];
  /** Papers chosen elsewhere (e.g. the library); all papers when empty. */
  initialIds: string[];
  groups: PaperGroup[];
  projectName: string;
  onFocusPaper: (id: string) => void;
}

export function WritingPanel({ papers, initialIds, groups, projectName, onFocusPaper }: WritingPanelProps) {
  const [tab, setTab] = useState<'draft' | 'gaps' | 'cite'>('draft');
  const health = useApiHealth();
  const llmEnabled = health.status === 'ok' && health.health.llm.enabled;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialIds.length ? initialIds : papers.slice(0, 80).map((p) => p.id)),
  );
  const [topic, setTopic] = useState('');
  const { settings } = useSettings();
  const t = useT();
  const [lang, setLang] = useState<'ja' | 'en'>(settings.aiLanguage);
  const [useLlm, setUseLlm] = useState(settings.useLlm);
  const [copied, setCopied] = useState(false);
  const draft = useStream('/api/llm/related-work');

  const chosen = useMemo(() => papers.filter((p) => selected.has(p.id)), [papers, selected]);
  const streaming = draft.state.status === 'streaming';
  const text = draft.state.status === 'idle' ? '' : draft.state.text;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const generate = () =>
    draft.run({
      papers: chosen.slice(0, 80),
      groups: groups.map((g) => ({ label: g.label, paperIds: g.paperIds.filter((id) => selected.has(id)) })),
      topic,
      lang,
      useLlm: llmEnabled && useLlm,
    });

  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'draft'}
          className={`${styles.tab} ${tab === 'draft' ? styles.tabActive : ''}`}
          onClick={() => setTab('draft')}
        >
          {t('write.tab.draft')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'gaps'}
          className={`${styles.tab} ${tab === 'gaps' ? styles.tabActive : ''}`}
          onClick={() => setTab('gaps')}
        >
          {t('write.tab.gaps')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'cite'}
          className={`${styles.tab} ${tab === 'cite' ? styles.tabActive : ''}`}
          onClick={() => setTab('cite')}
        >
          {t('write.tab.cite')}
        </button>
      </div>
      {tab === 'cite' && <CitationCheck papers={papers} projectName={projectName} onFocusPaper={onFocusPaper} />}
      {tab !== 'cite' && (
        <>
          <label className={styles.field}>
            <span className={styles.label}>{t('write.topic')}</span>
            <textarea
              className={styles.input}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t('write.topicPlaceholder')}
            />
          </label>

          <div className={styles.row}>
            <label className={styles.inline}>
              {t('write.language')}
              <select value={lang} onChange={(e) => setLang(e.target.value as 'ja' | 'en')}>
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className={`${styles.inline} ${!llmEnabled ? styles.disabled : ''}`} title={llmEnabled ? '' : t('write.llmMissing')}>
              <input type="checkbox" checked={llmEnabled && useLlm} disabled={!llmEnabled} onChange={(e) => setUseLlm(e.target.checked)} />
              {t('write.useLlm')}
            </label>
          </div>

          <details className={styles.papers}>
            <summary>
              {t('write.papers', { n: chosen.length, total: papers.length })}
              {chosen.length > 80 && t('write.first80')}
            </summary>
            <div className={styles.paperActions}>
              <button type="button" className={styles.link} onClick={() => setSelected(new Set(papers.map((p) => p.id)))}>
                {t('write.all')}
              </button>
              <button type="button" className={styles.link} onClick={() => setSelected(new Set())}>
                {t('write.none')}
              </button>
            </div>
            <ul>
              {papers.map((p) => (
                <li key={p.id}>
                  <label>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    <span>
                      {p.year || '—'} · {p.title}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </details>

          {groups.length > 0 && (
            <div className={styles.hint}>
              {t('write.sections', { names: groups.map((g) => g.label).join(t.lang === 'ja' ? '、' : ', ') })}
            </div>
          )}
        </>
      )}

      {tab === 'gaps' && (
        <GapsView
          papers={chosen}
          groups={groups}
          topic={topic}
          lang={lang}
          useLlm={llmEnabled && useLlm}
          onFocusPaper={onFocusPaper}
        />
      )}

      {tab === 'draft' && (
        <>
          <button type="button" className={styles.primary} onClick={generate} disabled={streaming || chosen.length === 0}>
            {streaming ? t('write.writing') : llmEnabled && useLlm ? t('write.draft') : t('write.outline')}
          </button>

          {draft.state.status === 'error' && <div className={styles.error}>{draft.state.message}</div>}
          {text && (
            <div className={styles.output}>
              <div className={styles.outputHeader}>
                {draft.state.status === 'done' && (
                  <span className={draft.state.mode === 'llm' ? styles.badge : styles.badgeMuted}>
                    {draft.state.mode === 'llm' ? t('write.badgeLlm') : t('write.badgeOutline')}
                  </span>
                )}
                <span className={styles.outputActions}>
                  <button type="button" className={styles.link} onClick={copy} disabled={streaming}>
                    {copied ? t('write.copied') : t('write.copyMd')}
                  </button>
                  <button
                    type="button"
                    className={styles.link}
                    disabled={streaming}
                    onClick={() => downloadText(`${safeFileName(projectName)}-related-work.md`, text, 'text/markdown')}
                  >
                    .md
                  </button>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => downloadText(`${safeFileName(projectName)}.bib`, toBibtex(chosen), 'application/x-bibtex')}
                  >
                    .bib
                  </button>
                </span>
              </div>
              <MiniMarkdown text={text} className={styles.markdown} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
