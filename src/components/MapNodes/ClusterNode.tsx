import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import type { ClusterNodeData } from '../../types';
import { useMapActions } from '../MindMap/mapActionsContext';
import { useT } from '../../hooks/useT';
import styles from './MapNodes.module.css';

function ClusterNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as unknown as ClusterNodeData;
  const left = d.side === 'left';
  const { renameCluster } = useMapActions();
  const t = useT();
  const [editing, setEditing] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const prevSide = useRef(d.side);
  useEffect(() => {
    if (prevSide.current === d.side) return;
    prevSide.current = d.side;
    updateNodeInternals(id);
  }, [id, d.side, updateNodeInternals]);

  const commit = (value: string) => {
    setEditing(false);
    if (value.trim() && value.trim() !== d.label) renameCluster(id, value);
  };

  return (
    <div
      className={`${styles.cluster} ${selected ? styles.selected : ''}`}
      style={{ borderColor: d.color, ['--accent' as string]: d.color }}
      onDoubleClick={() => setEditing(true)}
      title={t('map.renameCluster')}
    >
      <Handle type="target" position={left ? Position.Right : Position.Left} className={styles.hiddenHandle} />
      <span className={styles.clusterDot} style={{ background: d.color }} />
      {editing ? (
        <input
          className={`${styles.clusterInput} nodrag`}
          defaultValue={d.label}
          autoFocus
          aria-label={t('map.clusterName')}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') setEditing(false);
            // Keep Backspace/Delete from deleting the node while typing.
            e.stopPropagation();
          }}
        />
      ) : (
        <span className={styles.clusterLabel} title={`${d.label} (${d.level})`}>
          {d.label}
        </span>
      )}
      <span className={styles.clusterCount}>{d.size}</span>
      <Handle type="source" position={left ? Position.Left : Position.Right} className={styles.hiddenHandle} />
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeComponent);
