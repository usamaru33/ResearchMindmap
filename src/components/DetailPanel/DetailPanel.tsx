import type { ExpandKind } from '../../../shared/types';
import type { Paper } from '../../types';
import { ExpandSection } from './ExpandSection';
import { ReadingSection } from './ReadingSection';
import { CiteSection } from './CiteSection';
import { SummarySection } from './SummarySection';
import { getYearColor } from '../../utils/helpers';
import { useT } from '../../hooks/useT';
import styles from './DetailPanel.module.css';

interface DetailPanelProps {
  paper: Paper | null;
  references: Paper[];
  citedBy: Paper[];
  onClose: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSelectPaper: (id: string) => void;
  mapIds: Set<string>;
  onAddLinked: (anchorId: string, papers: Paper[], kind: ExpandKind) => void;
  knownTags: string[];
  onUpdateMeta: (id: string, patch: Partial<Paper>) => void;
}

export function DetailPanel({
  paper,
  references,
  citedBy,
  onClose,
  onEdit,
  onDelete,
  onSelectPaper,
  mapIds,
  onAddLinked,
  knownTags,
  onUpdateMeta,
}: DetailPanelProps) {
  const t = useT();
  const isOpen = paper !== null;

  return (
    <div className={`${styles.panel} ${!isOpen ? styles.panelClosed : ''}`}>
      {paper && (
        <>
          <div className={styles.header}>
            <span className={styles.headerTitle}>{paper.title}</span>
            <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>
              &times;
            </button>
          </div>

          <div className={styles.body}>
            {paper.thumbnailUrl && (
              <img
                src={paper.thumbnailUrl}
                alt={paper.title}
                className={styles.thumbnail}
              />
            )}

            <div className={styles.meta}>
              <span
                className={`${styles.metaBadge} ${styles.yearBadge}`}
                style={{ backgroundColor: getYearColor(paper.year) }}
              >
                {paper.year}
              </span>
              <span className={`${styles.metaBadge} ${styles.venueBadge}`}>
                {paper.venue}
              </span>
            </div>

            <ReadingSection
              // Remount when notes change from outside (e.g. "メモに追加") so the editor shows them.
              key={`reading-${paper.id}-${(paper.notes ?? '').length}`}
              paper={paper}
              knownTags={knownTags}
              onChange={(patch) => onUpdateMeta(paper.id, patch)}
            />

            <div className={styles.section}>
              <div className={styles.sectionLabel}>{t('detail.authors')}</div>
              <div>
                {paper.authors.map((author, i) => (
                  <div key={i} className={styles.authorItem}>
                    {author}
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>{t('detail.affiliation')}</div>
              <div className={styles.belongsText}>{paper.belongs}</div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>{t('detail.abstract')}</div>
              <div className={styles.abstractText}>{paper.abstract}</div>
            </div>

            {paper.challenges && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>{t('detail.challenges')}</div>
                <div className={styles.futureWorkText}>{paper.challenges}</div>
              </div>
            )}

            {paper.futureWork && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>{t('detail.futureWork')}</div>
                <div className={styles.futureWorkText}>{paper.futureWork}</div>
              </div>
            )}

            <SummarySection
              key={`summary-${paper.id}`}
              paper={paper}
              onAppendNotes={(text) =>
                onUpdateMeta(paper.id, { notes: paper.notes ? `${paper.notes}\n\n${text}` : text })
              }
            />

            <CiteSection key={`cite-${paper.id}`} paper={paper} />

            <ExpandSection
              key={`expand-${paper.id}`}
              paper={paper}
              mapIds={mapIds}
              onAdd={(papers, kind) => onAddLinked(paper.id, papers, kind)}
            />

            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                {t('detail.references')}
                {references.length > 0 && (
                  <span className={styles.citedByCount}>{references.length}</span>
                )}
              </div>
              {references.length > 0 ? (
                <ul className={styles.refList}>
                  {references.map((ref) => (
                    <li key={ref.id} className={styles.refItem}>
                      <span className={styles.refYear}>{ref.year}</span>
                      <button
                        className={styles.refLink}
                        onClick={() => onSelectPaper(ref.id)}
                      >
                        {ref.title}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.emptyNote}>{t('detail.noReferences')}</div>
              )}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                {t('detail.citedBy')}
                {citedBy.length > 0 && (
                  <span className={styles.citedByCount}>{citedBy.length}</span>
                )}
              </div>
              {citedBy.length > 0 ? (
                <ul className={styles.refList}>
                  {citedBy.map((cb) => (
                    <li key={cb.id} className={styles.refItem}>
                      <span className={styles.refYear}>{cb.year}</span>
                      <button
                        className={styles.refLink}
                        onClick={() => onSelectPaper(cb.id)}
                      >
                        {cb.title}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.emptyNote}>{t('detail.notCited')}</div>
              )}
            </div>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.editBtn}
              onClick={() => onEdit(paper.id)}
            >
              {t('detail.edit')}
            </button>
            <button
              className={styles.deleteBtn}
              onClick={() => onDelete(paper.id)}
            >
              {t('detail.delete')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
