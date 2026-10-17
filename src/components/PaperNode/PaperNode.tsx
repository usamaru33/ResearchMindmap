import { memo, useEffect, useRef } from 'react';
import { Handle, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import type { PaperNodeData } from '../../types';
import { getYearColor, truncateAuthors } from '../../utils/helpers';
import { useHandlePositions } from '../MindMap/layoutDirectionContext';
import styles from './PaperNode.module.css';

function PaperNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as PaperNodeData;
  const { paper } = nodeData;
  const yearColor = getYearColor(paper.year);
  const handles = useHandlePositions();
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
      <div className={`${styles.card} ${selected ? styles.cardSelected : ''}`}>
        <div className={styles.header}>
          <span className={styles.yearBadge} style={{ backgroundColor: yearColor }}>
            {paper.year}
          </span>
          <span className={styles.title}>{paper.title}</span>
        </div>
        <div className={styles.authors}>{truncateAuthors(paper.authors)}</div>
        <div className={styles.venue}>{paper.venue}</div>
        <div className={styles.belongs}>{paper.belongs}</div>
      </div>
      <Handle type="source" position={handles.source} />
    </>
  );
}

export const PaperNode = memo(PaperNodeComponent);
