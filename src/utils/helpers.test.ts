import { describe, expect, it } from 'vitest';
import { safeUrl } from './helpers';

describe('safeUrl', () => {
  it('keeps web addresses and drops script or data URLs', () => {
    expect(safeUrl('https://arxiv.org/pdf/1706.03762')).toBe('https://arxiv.org/pdf/1706.03762');
    expect(safeUrl(' http://example.org/a b ')).toBe('http://example.org/a%20b');
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('JaVaScRiPt:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeUrl('/relative/path')).toBeUndefined();
    expect(safeUrl(undefined)).toBeUndefined();
  });
});
