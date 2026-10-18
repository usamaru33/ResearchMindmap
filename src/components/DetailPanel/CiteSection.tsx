import { useState } from 'react';
import { toBibtex } from '../../../shared/biblio/bibtex';
import { formatCitation, type CitationStyle } from '../../../shared/biblio/formats';
import type { Paper } from '../../types';
import { useT } from '../../hooks/useT';
import styles from './DetailPanel.module.css';

type Style = CitationStyle | 'bibtex';
const STYLES: Array<{ value: Style; label: string }> = [
  { value: 'apa', label: 'APA' },
  { value: 'ieee', label: 'IEEE' },
  { value: 'acm', label: 'ACM' },
  { value: 'bibtex', label: 'BibTeX' },
];

export function CiteSection({ paper }: { paper: Paper }) {
  const t = useT();
  const [style, setStyle] = useState<Style>('apa');
  const [copied, setCopied] = useState(false);
  const text = style === 'bibtex' ? toBibtex([paper]).trim() : formatCitation(paper, style);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionLabel}>{t('cite.title')}</div>
      <div className={styles.citeStyles} role="radiogroup" aria-label={t('cite.style')}>
        {STYLES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={style === s.value}
            className={`${styles.expandBtn} ${style === s.value ? styles.expandBtnActive : ''}`}
            onClick={() => setStyle(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <pre className={styles.citeText}>{text}</pre>
      <button type="button" className={styles.editBtn} onClick={copy}>
        {copied ? t('cite.copied') : t('cite.copy')}
      </button>
    </div>
  );
}
