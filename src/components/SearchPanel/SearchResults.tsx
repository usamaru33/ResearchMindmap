import { useState } from 'react';
import type { Paper, SourceReport } from '../../../shared/types';
import { getYearColor, truncateAuthors } from '../../utils/helpers';
import styles from './SearchPanel.module.css';

const SOURCE_SHORT: Record<string, string> = {
  openalex: 'OpenAlex',
  semanticscholar: 'S2',
  crossref: 'Crossref',
  arxiv: 'arXiv',
  pubmed: 'PubMed',
  ieee: 'IEEE',
  dblp: 'dblp',
};

export function SourceReports({ reports }: { reports: SourceReport[] }) {
  return (
    <ul className={styles.reports}>
      {reports.map((r) => (
        <li key={r.name} className={styles.report} title={[r.error, ...r.warnings].filter(Boolean).join('\n') || undefined}>
          <span className={`${styles.reportDot} ${styles[`report_${r.status}`]}`} aria-hidden />
          <span className={styles.reportName}>{r.label}</span>
          <span className={styles.reportCount}>
            {r.status === 'ok' ? (
              <>
                {r.kept ?? r.count}
                <span className={styles.muted}>/{r.count}</span>
                {r.total !== undefined && <span className={styles.muted}> of {r.total.toLocaleString()}</span>}
              </>
            ) : r.status === 'skipped' ? (
              <span className={styles.muted}>off</span>
            ) : (
              <span className={styles.errorText}>error</span>
            )}
          </span>
          {(r.warnings.length > 0 || r.error) && (
            <span className={styles.reportNote}>{r.error ?? r.warnings[0]}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

interface ResultItemProps {
  paper: Paper;
  checked: boolean;
  inMap: boolean;
  onToggle: () => void;
}

function ResultItem({ paper, checked, inMap, onToggle }: ResultItemProps) {
  const [open, setOpen] = useState(false);
  const link = paper.url ?? (paper.ids?.doi ? `https://doi.org/${paper.ids.doi}` : undefined);
  return (
    <li className={`${styles.result} ${checked ? styles.resultChecked : ''}`}>
      <input
        type="checkbox"
        className={styles.resultCheck}
        checked={checked}
        onChange={onToggle}
        aria-label={`Select ${paper.title}`}
      />
      <div className={styles.resultBody}>
        <div className={styles.resultTitleRow}>
          <span className={styles.yearBadge} style={{ backgroundColor: getYearColor(paper.year) }}>
            {paper.year || '—'}
          </span>
          <button type="button" className={styles.resultTitle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {paper.title}
          </button>
        </div>
        <div className={styles.resultMeta}>
          {truncateAuthors(paper.authors, 3)}
          {paper.venue && <> · <i>{paper.venue}</i></>}
        </div>
        <div className={styles.resultTags}>
          {(paper.sources ?? []).map((s) => (
            <span key={s} className={styles.sourceTag} title={s}>
              {SOURCE_SHORT[s] ?? s}
            </span>
          ))}
          {paper.citationCount !== undefined && <span className={styles.metaTag}>{paper.citationCount.toLocaleString()} cites</span>}
          {paper.pdfUrl && <span className={styles.metaTag}>PDF</span>}
          {inMap && <span className={styles.inMapTag}>in map</span>}
          {paper.relevance !== undefined && (
            <span className={styles.relevance} title={`Relevance ${paper.relevance}`}>
              <span style={{ width: `${Math.round(paper.relevance * 100)}%` }} />
            </span>
          )}
        </div>
        {open && (
          <div className={styles.resultDetail}>
            {paper.abstract ? <p>{paper.abstract}</p> : <p className={styles.muted}>No abstract available.</p>}
            {link && (
              <a href={link} target="_blank" rel="noreferrer">
                Open ↗
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

interface SearchResultsProps {
  results: Paper[];
  selected: Set<string>;
  mapIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (all: boolean) => void;
}

export function SearchResults({ results, selected, mapIds, onToggle, onSelectAll }: SearchResultsProps) {
  if (results.length === 0) {
    return <div className={styles.empty}>No results. Try fewer terms, OR alternatives, or removing filters.</div>;
  }
  return (
    <div>
      <div className={styles.resultsHeader}>
        <span>
          {results.length} results · {selected.size} selected
        </span>
        <span className={styles.resultsActions}>
          <button type="button" className={styles.linkBtn} onClick={() => onSelectAll(true)}>
            All
          </button>
          <button type="button" className={styles.linkBtn} onClick={() => onSelectAll(false)}>
            None
          </button>
        </span>
      </div>
      <ul className={styles.results}>
        {results.map((p) => (
          <ResultItem
            key={p.id}
            paper={p}
            checked={selected.has(p.id)}
            inMap={mapIds.has(p.id)}
            onToggle={() => onToggle(p.id)}
          />
        ))}
      </ul>
    </div>
  );
}
