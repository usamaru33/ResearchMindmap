import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { PaperNodeData } from '../../types';
import { getYearColor, truncateAuthors } from '../../utils/helpers';
import styles from './PaperNode.module.css';

function PaperNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as PaperNodeData;
  const { paper } = nodeData;
  const yearColor = getYearColor(paper.year);

  return (
    <>
      <Handle type="target" position={Position.Left} />
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
      <Handle type="source" position={Position.Right} />
    </>
  );
}

export const PaperNode = memo(PaperNodeComponent);
