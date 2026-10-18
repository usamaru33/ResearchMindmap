import { useId, useState } from 'react';
import type { Paper } from '../../types';
import { STATUS_OPTIONS, normalizeTag } from '../../utils/reading';
import { useT } from '../../hooks/useT';
import type { MessageKey } from '../../i18n';
import styles from './DetailPanel.module.css';

interface ReadingSectionProps {
  paper: Paper;
  /** Tags used anywhere in the map, for suggestions. */
  knownTags: string[];
  onChange: (patch: Partial<Paper>) => void;
}

function links(paper: Paper, pageLabel: string): Array<{ label: string; href: string }> {
  const out: Array<{ label: string; href: string }> = [];
  if (paper.pdfUrl) out.push({ label: 'PDF', href: paper.pdfUrl });
  if (paper.ids?.doi) out.push({ label: 'DOI', href: `https://doi.org/${paper.ids.doi}` });
  if (paper.ids?.arxiv) out.push({ label: 'arXiv', href: `https://arxiv.org/abs/${paper.ids.arxiv}` });
  if (paper.ids?.pmid) out.push({ label: 'PubMed', href: `https://pubmed.ncbi.nlm.nih.gov/${paper.ids.pmid}/` });
  if (paper.url && !out.some((l) => l.href === paper.url)) out.push({ label: pageLabel, href: paper.url });
  if (paper.ids?.openalex) out.push({ label: 'OpenAlex', href: `https://openalex.org/${paper.ids.openalex}` });
  return out;
}

export function ReadingSection({ paper, knownTags, onChange }: ReadingSectionProps) {
  const t = useT();
  const listId = useId();
  const [tagInput, setTagInput] = useState('');
  // Notes are edited locally and saved on blur, so typing does not churn the store.
  const [notes, setNotes] = useState(paper.notes ?? '');
  const tags = paper.tags ?? [];
  const rating = paper.rating ?? 0;

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (tag && !tags.includes(tag)) onChange({ tags: [...tags, tag] });
    setTagInput('');
  };

  const saveNotes = () => {
    if (notes !== (paper.notes ?? '')) onChange({ notes });
  };

  const paperLinks = links(paper, t('reading.page'));

  return (
    <>
      {paperLinks.length > 0 && (
        <div className={styles.linkRow}>
          {paperLinks.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className={styles.linkChip}>
              {l.label} ↗
            </a>
          ))}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionLabel}>{t('reading.title')}</div>
        <div className={styles.statusRow} role="radiogroup" aria-label={t('reading.status')}>
          {STATUS_OPTIONS.map((s) => {
            const active = (paper.status ?? 'unread') === s.value;
            return (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={`${styles.statusBtn} ${active ? styles.statusBtnActive : ''}`}
                style={active ? { borderColor: s.color, color: s.color } : undefined}
                onClick={() => onChange({ status: s.value })}
              >
                <span className={styles.statusDot} style={{ background: s.color }} />
                {t(s.label as MessageKey)}
              </button>
            );
          })}
        </div>
        <div className={styles.stars} role="radiogroup" aria-label={t('reading.rating')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={t('reading.stars', { n })}
              className={`${styles.star} ${n <= rating ? styles.starOn : ''}`}
              // Clicking the current rating clears it.
              onClick={() => onChange({ rating: rating === n ? 0 : n })}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>{t('reading.tags')}</div>
        <div className={styles.tagRow}>
          {tags.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
              <button
                type="button"
                className={styles.tagRemove}
                aria-label={t('reading.removeTag', { tag })}
                onClick={() => onChange({ tags: tags.filter((x) => x !== tag) })}
              >
                ×
              </button>
            </span>
          ))}
          <input
            className={styles.tagInput}
            value={tagInput}
            list={listId}
            placeholder={t('reading.tagPlaceholder')}
            aria-label={t('reading.addTag')}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagInput);
              } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                onChange({ tags: tags.slice(0, -1) });
              }
            }}
            onBlur={() => tagInput && addTag(tagInput)}
          />
          <datalist id={listId}>
            {knownTags.filter((k) => !tags.includes(k)).map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>{t('reading.notes')}</div>
        <textarea
          className={styles.notes}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder={t('reading.notesPlaceholder')}
          aria-label={t('reading.notes')}
        />
      </div>
    </>
  );
}
