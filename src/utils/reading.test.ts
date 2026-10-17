import { describe, expect, it } from 'vitest';
import { normalizeTag, statusInfo, tagCounts } from './reading';

describe('reading helpers', () => {
  it('normalizes tags', () => {
    expect(normalizeTag('  #deep   learning ')).toBe('deep learning');
  });
  it('counts tags, most used first', () => {
    expect(tagCounts([['vr', 'haptics'], ['vr'], undefined])).toEqual([['vr', 2], ['haptics', 1]]);
  });
  it('describes statuses', () => {
    expect(statusInfo('read')?.label).toBe('Read');
    expect(statusInfo(undefined)).toBeUndefined();
  });
});
