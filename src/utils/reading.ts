import type { ReadingStatus } from '../../shared/types';
import type { MessageKey } from '../i18n';

export const STATUS_OPTIONS: Array<{ value: ReadingStatus; label: MessageKey; color: string }> = [
  { value: 'unread', label: 'status.unread', color: '#94a3b8' },
  { value: 'reading', label: 'status.reading', color: '#f59e0b' },
  { value: 'read', label: 'status.read', color: '#10b981' },
  { value: 'skipped', label: 'status.skipped', color: '#ef4444' },
];

export function statusInfo(status: ReadingStatus | undefined) {
  return STATUS_OPTIONS.find((s) => s.value === status);
}

/** Normalize a typed tag: trimmed, inner spaces collapsed, no leading '#'. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ');
}

/** All distinct tags in use, most used first. */
export function tagCounts(tagLists: Array<string[] | undefined>): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const tags of tagLists) for (const t of tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
