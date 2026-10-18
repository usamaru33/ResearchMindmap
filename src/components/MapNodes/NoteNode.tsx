import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { NOTE_COLORS, type NoteNodeData } from '../../types';
import { NOTE_STYLE } from './noteColors';
import { useMapActions } from '../MindMap/mapActionsContext';
import { useT } from '../../hooks/useT';
import { MiniMarkdown } from '../common/MiniMarkdown';
import type { MessageKey } from '../../i18n';
import styles from './MapNodes.module.css';

/** A free-form sticky note on the map: double-click to edit, Markdown is rendered. */
function NoteNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as unknown as NoteNodeData;
  const { updateNote, removeNote } = useMapActions();
  const t = useT();
  // A fresh note opens for typing.
  const [editing, setEditing] = useState(d.text === '');
  const color = NOTE_STYLE[d.color] ?? NOTE_STYLE.yellow;
  const input = useRef<HTMLTextAreaElement>(null);
  // React Flow takes focus back after the click that created the note; focus once that is done.
  useEffect(() => {
    if (!editing) return;
    const timer = window.setTimeout(() => input.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [editing]);

  const commit = (value: string) => {
    setEditing(false);
    if (!value.trim()) removeNote(id, !d.text);
    else if (value !== d.text) updateNote(id, { text: value });
  };

  return (
    <div
      className={`${styles.note} ${selected ? styles.selected : ''}`}
      style={{ background: color.bg, borderColor: color.border, ['--accent' as string]: color.border }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title={editing ? undefined : t('note.editHint')}
    >
      <Handle type="target" position={Position.Left} className={styles.noteHandle} />
      {editing ? (
        <textarea
          className={`${styles.noteInput} nodrag nowheel`}
          ref={input}
          defaultValue={d.text}
          placeholder={t('note.placeholder')}
          aria-label={t('note.label')}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit((e.target as HTMLTextAreaElement).value);
            if (e.key === 'Escape') {
              if (!d.text) removeNote(id, true);
              setEditing(false);
            }
            // Keep Backspace/Delete from deleting the node while typing.
            e.stopPropagation();
          }}
        />
      ) : (
        <MiniMarkdown text={d.text} className={styles.noteText} />
      )}
      {selected && !editing && (
        <div className={`${styles.noteColors} nodrag`} role="group" aria-label={t('note.color')}>
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={t(`note.color.${c}` as MessageKey)}
              aria-pressed={d.color === c}
              style={{ background: NOTE_STYLE[c].bg, borderColor: NOTE_STYLE[c].border }}
              onClick={(e) => {
                e.stopPropagation();
                updateNote(id, { color: c });
              }}
            />
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className={styles.noteHandle} />
    </div>
  );
}

export const NoteNode = memo(NoteNodeComponent);
