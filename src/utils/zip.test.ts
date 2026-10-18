import { describe, expect, it } from 'vitest';
import { crc32, makeZip } from './zip';

/** Read back the stored entries, following the central directory like an unzip tool would. */
function readZip(bytes: Uint8Array): Array<{ name: string; content: string; crcOk: boolean }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const dataStart = local + 30 + view.getUint16(local + 26, true);
    const data = bytes.subarray(dataStart, dataStart + size);
    out.push({ name, content: dec.decode(data), crcOk: crc32(data) === crc });
    p += 46 + nameLen;
  }
  return out;
}

describe('zip', () => {
  it('computes CRC-32', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
  });

  it('stores UTF-8 files that read back intact', () => {
    const zip = makeZip([
      { name: 'notes/vaswani2017attention.md', content: '# Attention\n' },
      { name: 'notes/日本語.md', content: '身体所有感 ✓' },
    ], new Date(2026, 9, 18, 12, 30));
    expect(readZip(zip)).toEqual([
      { name: 'notes/vaswani2017attention.md', content: '# Attention\n', crcOk: true },
      { name: 'notes/日本語.md', content: '身体所有感 ✓', crcOk: true },
    ]);
  });
});
