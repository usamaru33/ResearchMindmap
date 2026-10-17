import { describe, expect, it } from 'vitest';
import { imageSize } from './exportImage';

describe('imageSize', () => {
  it('renders at 1.5x but caps the longest side', () => {
    expect(imageSize({ width: 1000, height: 500 })).toEqual({ width: 1500, height: 750 });
    expect(imageSize({ width: 20000, height: 5000 })).toEqual({ width: 6000, height: 1500 });
    expect(imageSize({ width: 10, height: 10 })).toEqual({ width: 320, height: 240 });
  });
});
