import { useState, useEffect } from 'react';
import type { Paper } from '../../types';
import { generateId } from '../../utils/helpers';
import styles from './PaperForm.module.css';

interface PaperFormProps {
  paper?: Paper | null;
  allPapers: Paper[];
  onSubmit: (paper: Paper) => void;
  onCancel: () => void;
}

export function PaperForm({ paper, allPapers, onSubmit, onCancel }: PaperFormProps) {
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [belongs, setBelongs] = useState('');
  const [year, setYear] = useState(2024);
  const [venue, setVenue] = useState('');
  const [abstract_, setAbstract] = useState('');
  const [challenges, setChallenges] = useState('');
  const [futureWork, setFutureWork] = useState('');
  const [references, setReferences] = useState<string[]>([]);
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  useEffect(() => {
    if (paper) {
      setTitle(paper.title);
      setAuthors(paper.authors.join(', '));
      setBelongs(paper.belongs);
      setYear(paper.year);
      setVenue(paper.venue);
      setAbstract(paper.abstract);
      setChallenges(paper.challenges);
      setFutureWork(paper.futureWork);
      setReferences(paper.references);
      setThumbnailUrl(paper.thumbnailUrl ?? '');
    } else {
      setTitle('');
      setAuthors('');
      setBelongs('');
      setYear(2024);
      setVenue('');
      setAbstract('');
      setChallenges('');
      setFutureWork('');
      setReferences([]);
      setThumbnailUrl('');
    }
  }, [paper]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: paper?.id ?? generateId(),
      title: title.trim(),
      authors: authors.split(',').map((a) => a.trim()).filter(Boolean),
      belongs: belongs.trim(),
      year,
      venue: venue.trim(),
      abstract: abstract_.trim(),
      challenges: challenges.trim(),
      futureWork: futureWork.trim(),
      references,
      thumbnailUrl: thumbnailUrl.trim() || undefined,
    });
  };

  const toggleReference = (id: string) => {
    setReferences((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  // Exclude self from reference candidates
  const refCandidates = allPapers
    .filter((p) => p.id !== paper?.id)
    .sort((a, b) => b.year - a.year);

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label className={styles.label}>Title *</label>
        <input
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Paper title"
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Authors *</label>
        <input
          className={styles.input}
          value={authors}
          onChange={(e) => setAuthors(e.target.value)}
          placeholder="Author 1, Author 2, ..."
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Affiliation</label>
        <input
          className={styles.input}
          value={belongs}
          onChange={(e) => setBelongs(e.target.value)}
          placeholder="University or Organization"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Year *</label>
        <input
          className={`${styles.input} ${styles.yearInput}`}
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          min={1900}
          max={2100}
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Venue *</label>
        <input
          className={styles.input}
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          placeholder="Conference or Journal name"
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Abstract *</label>
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          value={abstract_}
          onChange={(e) => setAbstract(e.target.value)}
          placeholder="Paper abstract"
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Challenges</label>
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          value={challenges}
          onChange={(e) => setChallenges(e.target.value)}
          placeholder="Known challenges or limitations"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Future Work</label>
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          value={futureWork}
          onChange={(e) => setFutureWork(e.target.value)}
          placeholder="Proposed future directions"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          References ({references.length} selected)
        </label>
        {refCandidates.length > 0 ? (
          <div className={styles.checkboxList}>
            {refCandidates.map((p) => (
              <label key={p.id} className={styles.checkboxItem}>
                <input
                  type="checkbox"
                  checked={references.includes(p.id)}
                  onChange={() => toggleReference(p.id)}
                />
                <span className={styles.checkboxLabel}>
                  {p.title}
                  <span className={styles.checkboxYear}>({p.year})</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className={styles.emptyRefs}>No other papers to reference</div>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Thumbnail URL</label>
        <input
          className={styles.input}
          value={thumbnailUrl}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={styles.submitBtn}>
          {paper ? 'Update' : 'Add Paper'}
        </button>
      </div>
    </form>
  );
}
