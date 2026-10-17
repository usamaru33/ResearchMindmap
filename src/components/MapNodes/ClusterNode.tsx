import { memo, useEffect, useRef } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import type { ClusterNodeData } from '../../types';
import styles from './MapNodes.module.css';

function ClusterNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as unknown as ClusterNodeData;
  const left = d.side === 'left';
  const updateNodeInternals = useUpdateNodeInternals();
  const prevSide = useRef(d.side);
  useEffect(() => {
    if (prevSide.current === d.side) return;
    prevSide.current = d.side;
    updateNodeInternals(id);
  }, [id, d.side, updateNodeInternals]);

  return (
    <div
      className={`${styles.cluster} ${selected ? styles.selected : ''}`}
      style={{ borderColor: d.color, ['--accent' as string]: d.color }}
    >
      <Handle type="target" position={left ? Position.Right : Position.Left} className={styles.hiddenHandle} />
      <span className={styles.clusterDot} style={{ background: d.color }} />
      <span className={styles.clusterLabel} title={`${d.label} (${d.level})`}>
        {d.label}
      </span>
      <span className={styles.clusterCount}>{d.size}</span>
      <Handle type="source" position={left ? Position.Left : Position.Right} className={styles.hiddenHandle} />
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeComponent);
