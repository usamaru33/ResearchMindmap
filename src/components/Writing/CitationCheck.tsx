import { useMemo, useState } from 'react';
import { toBibtex } from '../../../shared/biblio/bibtex';
import type { Paper } from '../../types';
import { useT } from '../../hooks/useT';
import { checkDraft, isLatex } from '../../utils/draftCitations';
import { downloadText, safeFileName } from '../../utils/download';
import styles from './WritingPanel.module.css';

interface CitationCheckProps {
  papers: Paper[];
  projectName: string;
  onFocusPaper: (id: string) => void;
}

/** Check a LaTeX / Markdown draft's citation keys against the map (the draft itself is not saved). */
export function CitationCheck({ papers, projectName, onFocusPaper }: CitationCheckProps) {
  const t = useT();
  const [text, setText] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const result = useMemo(() => checkDraft(text, papers), [text, papers]);
  const hasDraft = text.trim().length > 0;
  const latex = isLatex(text);

  const copy = async (key: string) => {
    await navigator.clipboard.writeText(latex || !hasDraft ? `\\cite{${key}}` : `[@${key}]`).catch(() => undefined);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1200);
  };

  const loadFile = async (file: File | undefined) => {
    if (file) setText(await file.text());
  };

  return (
    <>
      <label className={styles.field}>
        <span className={styles.label}>{t('cite.draft')}</span>
        <textarea
          className={`${styles.input} ${styles.code}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('cite.placeholder')}
          spellCheck={false}
        />
      </label>
      <div className={styles.row}>
        <label className={styles.inline}>
          {t('cite.openFile')}
          <input type="file" accept=".tex,.md,.markdown,.qmd,.rmd,.txt" onChange={(e) => void loadFile(e.target.files?.[0])} />
        </label>
      </div>

      {hasDraft && (
        <div className={styles.output}>
          <div className={styles.outputHeader}>
            <span className={styles.badgeMuted}>{latex ? 'LaTeX' : 'Markdown'}</span>
            <span className={styles.outputActions}>
              <button
                type="button"
                className={styles.link}
                disabled={result.cited.length === 0}
                onClick={() =>
                  downloadText(
                    `${safeFileName(projectName)}-cited.bib`,
                    toBibtex(result.cited.map((c) => c.paper), result.keys),
                    'application/x-bibtex',
                  )
                }
              >
                {t('cite.exportCited')}
              </button>
            </span>
          </div>
          <div className={styles.hint}>
            {t('cite.summary', { uses: result.uses, cited: result.cited.length, unknown: result.unknown.length, uncited: result.uncited.length })}
          </div>

          {result.uses === 0 && <div className={styles.hint}>{t('cite.noCitations')}</div>}

          {result.unknown.length > 0 && (
            <section className={styles.citeGroup}>
              <h4 className={styles.warnHeading}>{t('cite.unknown', { n: result.unknown.length })}</h4>
              <ul className={styles.citeList}>
                {result.unknown.map((u) => (
                  <li key={u.key}>
                    <code>{u.key}</code>
                    <span className={styles.hint}>{t('cite.where', { line: u.firstLine, n: u.count })}</span>
                    {u.suggestions.length > 0 && (
                      <div className={styles.hint}>
                        {t('cite.didYouMean')}{' '}
                        {u.suggestions.map((s) => (
                          <button key={s.key} type="button" className={styles.link} title={s.paper.title} onClick={() => void copy(s.key)}>
                            {copied === s.key ? t('cite.copied') : s.key}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.cited.length > 0 && (
            <section className={styles.citeGroup}>
              <h4>{t('cite.cited', { n: result.cited.length })}</h4>
              <ul className={styles.citeList}>
                {result.cited.map((c) => (
                  <li key={c.paper.id}>
                    <code>{c.key}</code>
                    <span className={styles.hint}>{t('cite.where', { line: c.firstLine, n: c.count })}</span>
                    <button type="button" className={styles.link} onClick={() => onFocusPaper(c.paper.id)}>
                      {c.paper.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {result.uncited.length > 0 && (
        <details className={styles.papers} open={!hasDraft}>
          <summary>{hasDraft ? t('cite.uncited', { n: result.uncited.length }) : t('cite.keys', { n: result.uncited.length })}</summary>
          <ul className={styles.citeList}>
            {result.uncited.map((u) => (
              <li key={u.paper.id}>
                <button type="button" className={styles.link} title={t('cite.copyKey')} onClick={() => void copy(u.key)}>
                  <code>{copied === u.key ? t('cite.copied') : u.key}</code>
                </button>
                <button type="button" className={styles.paperLink} onClick={() => onFocusPaper(u.paper.id)}>
                  {u.paper.year || '—'} · {u.paper.title}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
