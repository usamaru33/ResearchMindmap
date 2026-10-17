import { memo, useEffect, useRef } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import type { PaperNodeData } from '../../types';
import { truncateAuthors } from '../../utils/helpers';
import { statusInfo } from '../../utils/reading';
import { useHandlePositions } from '../MindMap/layoutDirectionContext';
import { accentColor, badgeColor, citationScale, useMapView } from '../MindMap/mapViewContext';
import styles from './PaperNode.module.css';

function PaperNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as PaperNodeData;
  const { paper } = nodeData;
  const view = useMapView();
  const role = view.roles.get(id);
  const accent = accentColor(view.colorMode, paper, nodeData.accent);
  const yearColor = badgeColor(view.colorMode, paper, accent);
  const scale = view.sizeByCitations ? citationScale(paper.citationCount, view.maxCitations) : 1;
  // Excluded papers fade in screening mode so the included set stands out.
  const dimmed =
    (view.highlight !== null && !view.highlight.has(id)) ||
    (view.colorMode === 'screening' && paper.screening?.decision === 'exclude');
  // "To read" is the default; only show a status once the user has set one.
  const status = paper.status && paper.status !== 'unread' ? statusInfo(paper.status) : undefined;
  const directional = useHandlePositions();
  // In the mind-map layout, papers on the left side face their cluster on the right.
  const handles =
    nodeData.side === 'left'
      ? { target: Position.Right, source: Position.Left }
      : nodeData.side === 'right'
        ? { target: Position.Left, source: Position.Right }
        : directional;
  const updateNodeInternals = useUpdateNodeInternals();

  // React Flow caches handle bounds; re-measure when the layout direction moves
  // them. Skipped on mount, where React Flow measures the node itself.
  const prevTarget = useRef(handles.target);
  useEffect(() => {
    if (prevTarget.current === handles.target) return;
    prevTarget.current = handles.target;
    updateNodeInternals(id);
  }, [id, handles.target, updateNodeInternals]);

  return (
    <>
      <Handle type="target" position={handles.target} />
      <div
        className={`${styles.card} ${selected ? styles.cardSelected : ''} ${dimmed ? styles.dimmed : ''}`}
        style={{
          ...(accent ? { borderLeft: `4px solid ${accent}` } : {}),
          // zoom scales the whole card (text included) and React Flow measures the result.
          ...(scale !== 1 ? { zoom: scale } : {}),
        }}
      >
        {role && (
          <span className={`${styles.role} ${role === 'foundation' ? styles.roleFoundation : styles.roleRecent}`}>
            {role === 'foundation' ? '基礎論文' : '最新の発展'}
          </span>
        )}
        <div className={styles.header}>
          <span className={styles.yearBadge} style={{ backgroundColor: yearColor }}>
            {paper.year}
          </span>
          <span className={styles.title}>{paper.title}</span>
        </div>
        <div className={styles.authors}>{truncateAuthors(paper.authors)}</div>
        <div className={styles.venue}>{paper.venue}</div>
        <div className={styles.belongs}>{paper.belongs}</div>
        {(status || paper.rating || paper.tags?.length) && (
          <div className={styles.footer}>
            {status && (
              <span className={styles.status} style={{ color: status.color }}>
                <span className={styles.statusDot} style={{ background: status.color }} />
                {status.label}
              </span>
            )}
            {!!paper.rating && <span className={styles.rating}>{'★'.repeat(paper.rating)}</span>}
            {paper.tags?.slice(0, 3).map((t) => (
              <span key={t} className={styles.tag}>
                {t}
              </span>
            ))}
            {(paper.tags?.length ?? 0) > 3 && <span className={styles.more}>+{paper.tags!.length - 3}</span>}
          </div>
        )}
      </div>
      <Handle type="source" position={handles.source} />
    </>
  );
}

export const PaperNode = memo(PaperNodeComponent);
