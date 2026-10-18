import type { NoteColor } from '../../types';

export const NOTE_STYLE: Record<NoteColor, { bg: string; border: string }> = {
  yellow: { bg: '#fef9c3', border: '#eab308' },
  pink: { bg: '#fce7f3', border: '#ec4899' },
  green: { bg: '#dcfce7', border: '#22c55e' },
  blue: { bg: '#dbeafe', border: '#3b82f6' },
  gray: { bg: '#f1f5f9', border: '#94a3b8' },
};
