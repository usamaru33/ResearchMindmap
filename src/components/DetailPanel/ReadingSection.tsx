import { useId, useState } from 'react';
import type { Paper } from '../../types';
import { STATUS_OPTIONS, normalizeTag } from '../../utils/reading';
import styles from './DetailPanel.module.css';

interface ReadingSectionProps {
  paper: Paper;
  /** Tags used anywhere in the map, for suggestions. */
  knownTags: string[];
  onChange: (patch: Partial<Paper>) => void;
}

function links(paper: Paper): Array<{ label: string; href: string }> {
  const out: Array<{ label: string; href: string }> = [];
  if (paper.pdfUrl) out.push({ label: 'PDF', href: paper.pdfUrl });
  if (paper.ids?.doi) out.push({ label: 'DOI', href: `https://doi.org/${paper.ids.doi}` });
  if (paper.ids?.arxiv) out.push({ label: 'arXiv', href: `https://arxiv.org/abs/${paper.ids.arxiv}` });
  if (paper.ids?.pmid) out.push({ label: 'PubMed', href: `https://pubmed.ncbi.nlm.nih.gov/${paper.ids.pmid}/` });
  if (paper.url && !out.some((l) => l.href === paper.url)) out.push({ label: 'Page', href: paper.url });
  if (paper.ids?.openalex) out.push({ label: 'OpenAlex', href: `https://openalex.org/${paper.ids.openalex}` });
  return out;
}

export function ReadingSection({ paper, knownTags, onChange }: ReadingSectionProps) {
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

  const paperLinks = links(paper);

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
        <div className={styles.sectionLabel}>Reading</div>
        <div className={styles.statusRow} role="radiogroup" aria-label="Reading status">
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
                {s.label}
              </button>
            );
          })}
        </div>
        <div className={styles.stars} role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
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
        <div className={styles.sectionLabel}>Tags</div>
        <div className={styles.tagRow}>
          {tags.map((t) => (
            <span key={t} className={styles.tag}>
              {t}
              <button
                type="button"
                className={styles.tagRemove}
                aria-label={`Remove tag ${t}`}
                onClick={() => onChange({ tags: tags.filter((x) => x !== t) })}
              >
                ×
              </button>
            </span>
          ))}
          <input
            className={styles.tagInput}
            value={tagInput}
            list={listId}
            placeholder="+ tag"
            aria-label="Add tag"
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
            {knownTags.filter((t) => !tags.includes(t)).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Notes</div>
        <textarea
          className={styles.notes}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="要点、使えそうな手法、疑問点など"
          aria-label="Notes"
        />
      </div>
    </>
  );
}
