// A minimal ZIP writer (stored, no compression): enough to hand over a folder of text files.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Path inside the archive, with forward slashes. */
  name: string;
  content: string;
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Build a .zip of UTF-8 text files. */
export function makeZip(entries: ZipEntry[], now = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = enc.encode(e.content);
    const crc = crc32(data);
    // Bit 11: names are UTF-8.
    const header = (sig: number, central: boolean) => {
      const buf = new DataView(new ArrayBuffer((central ? 46 : 30) + name.length));
      let p = 0;
      const u32 = (v: number) => {
        buf.setUint32(p, v, true);
        p += 4;
      };
      const u16 = (v: number) => {
        buf.setUint16(p, v, true);
        p += 2;
      };
      u32(sig);
      if (central) u16(20);
      u16(20);
      u16(0x0800);
      u16(0);
      u16(time);
      u16(date);
      u32(crc);
      u32(data.length);
      u32(data.length);
      u16(name.length);
      u16(0);
      if (central) {
        u16(0);
        u16(0);
        u16(0);
        u32(0);
        u32(offset);
      }
      const bytes = new Uint8Array(buf.buffer);
      bytes.set(name, p);
      return bytes;
    };
    const local = header(0x04034b50, false);
    locals.push(local, data);
    centrals.push(header(0x02014b50, true));
    offset += local.length + data.length;
  }
  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
