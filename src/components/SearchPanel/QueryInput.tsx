import { useId, useState } from 'react';
import type { ParseResult } from '../../../shared/query';
import styles from './SearchPanel.module.css';

interface QueryInputProps {
  value: string;
  parse: ParseResult | null;
  canonical: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

const EXAMPLES = [
  '"body ownership" AND ("virtual reality" OR VR) NOT survey',
  'title:transformer AND (vision OR image) year:2020..2024 publisher:acm',
  '("Document Title":haptic* AND "Author Keywords":VR) oa:true',
  'TITLE-ABS-KEY("graph neural network" AND recommendation) AND PUBYEAR > 2019',
  '("deep learning"[tiab] OR cnn[ti]) AND 2018:2022[dp]',
];

function ErrorPreview({ text, start, end }: { text: string; start: number; end: number }) {
  // Show a window around the error so long queries stay readable.
  const from = Math.max(0, start - 30);
  const to = Math.min(text.length, Math.max(end, start + 1) + 30);
  const bad = text.slice(start, Math.max(end, start + 1)) || ' ';
  return (
    <code className={styles.errorPreview}>
      {from > 0 && '…'}
      {text.slice(from, start)}
      <mark>{bad}</mark>
      {text.slice(Math.max(end, start + 1), to)}
      {to < text.length && '…'}
    </code>
  );
}

export function QueryInput({ value, parse, canonical, onChange, onSubmit }: QueryInputProps) {
  const [showHelp, setShowHelp] = useState(false);
  const id = useId();
  const errors = parse && !parse.ok ? parse.errors : [];
  const warnings = parse && parse.ok ? parse.warnings : [];

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          Query
        </label>
        <button type="button" className={styles.linkBtn} onClick={() => setShowHelp((v) => !v)}>
          {showHelp ? 'Hide syntax' : 'Syntax help'}
        </button>
      </div>
      <textarea
        id={id}
        className={`${styles.input} ${styles.queryInput} ${errors.length ? styles.inputError : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={'"body ownership" AND "virtual reality" NOT survey'}
        spellCheck={false}
        aria-invalid={errors.length > 0}
        aria-describedby={`${id}-status`}
      />
      <div id={`${id}-status`} aria-live="polite">
        {errors.map((e, i) => (
          <div key={i} className={styles.queryError}>
            <span>{e.message}</span>
            <ErrorPreview text={value} start={e.start} end={e.end} />
          </div>
        ))}
        {warnings.map((w, i) => (
          <div key={i} className={styles.queryWarning}>
            {w.message}
          </div>
        ))}
        {canonical && !errors.length && (
          <div className={styles.canonical} title="Normalized query sent to every database">
            <span className={styles.canonicalLabel}>Parsed as</span> <code>{canonical}</code>
          </div>
        )}
      </div>

      {showHelp && (
        <div className={styles.help}>
          <p>
            ACM DL / IEEE Xplore / Scopus / Web of Science / PubMed の書き方をそのまま使えます。
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> で検索。
          </p>
          <table>
            <tbody>
              <tr>
                <td>
                  <code>"exact phrase"</code>
                </td>
                <td>フレーズ</td>
              </tr>
              <tr>
                <td>
                  <code>AND OR NOT ( )</code>
                </td>
                <td>論理演算（大文字）。<code>-word</code> も NOT</td>
              </tr>
              <tr>
                <td>
                  <code>title: abstract: tiab: author: venue: keyword:</code>
                </td>
                <td>
                  フィールド（<code>TI=</code> <code>"Document Title":</code> <code>[tiab]</code> 等も可）
                </td>
              </tr>
              <tr>
                <td>
                  <code>year:2019..2024 publisher:acm oa:true</code>
                </td>
                <td>絞り込み（最上位の AND にのみ）</td>
              </tr>
              <tr>
                <td>
                  <code>robot*</code>
                </td>
                <td>前方一致</td>
              </tr>
            </tbody>
          </table>
          <div className={styles.examples}>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className={styles.example} onClick={() => onChange(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
