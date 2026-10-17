import { useMemo, useState } from 'react';
import { toBibtex } from '../../../shared/biblio/bibtex';
import type { Paper } from '../../types';
import type { PaperGroup } from '../../store/groups';
import { useApiHealth } from '../../hooks/useApiHealth';
import { useStream } from '../../hooks/useStream';
import { downloadText, safeFileName } from '../../utils/download';
import { MiniMarkdown } from '../common/MiniMarkdown';
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
  const [tab, setTab] = useState<'draft' | 'gaps'>('draft');
  const health = useApiHealth();
  const llmEnabled = health.status === 'ok' && health.health.llm.enabled;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialIds.length ? initialIds : papers.slice(0, 80).map((p) => p.id)),
  );
  const [topic, setTopic] = useState('');
  const [lang, setLang] = useState<'ja' | 'en'>('ja');
  const [useLlm, setUseLlm] = useState(true);
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
          関連研究の下書き
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'gaps'}
          className={`${styles.tab} ${tab === 'gaps' ? styles.tabActive : ''}`}
          onClick={() => setTab('gaps')}
        >
          研究ギャップ
        </button>
      </div>
      <label className={styles.field}>
        <span className={styles.label}>Your topic</span>
        <textarea
          className={styles.input}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="例: VR におけるアバターの大きさと物体サイズ知覚の関係"
        />
      </label>

      <div className={styles.row}>
        <label className={styles.inline}>
          Language
          <select value={lang} onChange={(e) => setLang(e.target.value as 'ja' | 'en')}>
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className={`${styles.inline} ${!llmEnabled ? styles.disabled : ''}`} title={llmEnabled ? '' : 'ANTHROPIC_API_KEY が未設定（雛形を作ります）'}>
          <input type="checkbox" checked={llmEnabled && useLlm} disabled={!llmEnabled} onChange={(e) => setUseLlm(e.target.checked)} />
          Use LLM
        </label>
      </div>

      <details className={styles.papers}>
        <summary>
          Papers: {chosen.length} / {papers.length} selected
          {chosen.length > 80 && ' (最初の 80 件を使います)'}
        </summary>
        <div className={styles.paperActions}>
          <button type="button" className={styles.link} onClick={() => setSelected(new Set(papers.map((p) => p.id)))}>
            All
          </button>
          <button type="button" className={styles.link} onClick={() => setSelected(new Set())}>
            None
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
          マップのクラスタ（{groups.map((g) => g.label).join('、')}）ごとに節を立てます。
        </div>
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
            {streaming ? 'Writing…' : llmEnabled && useLlm ? 'Draft related work' : 'Build outline (LLM なし)'}
          </button>

          {draft.state.status === 'error' && <div className={styles.error}>{draft.state.message}</div>}
          {text && (
            <div className={styles.output}>
              <div className={styles.outputHeader}>
                {draft.state.status === 'done' && (
                  <span className={draft.state.mode === 'llm' ? styles.badge : styles.badgeMuted}>
                    {draft.state.mode === 'llm' ? 'LLM draft' : '雛形（LLM なし）'}
                  </span>
                )}
                <span className={styles.outputActions}>
                  <button type="button" className={styles.link} onClick={copy} disabled={streaming}>
                    {copied ? 'Copied ✓' : 'Copy Markdown'}
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
