export interface PersonName {
  family: string;
  given: string;
}

/**
 * Split an author string into family and given names. Handles
 * "Vaswani, A.", "Vaswani, Ashish", "Ashish Vaswani", "A. N. Gomez",
 * and family-name particles ("Ludwig van Beethoven" → family "van Beethoven").
 */
export function parseName(raw: string): PersonName {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return { family: '', given: '' };
  if (s.includes(',')) {
    const [family, ...rest] = s.split(',');
    return { family: family.trim(), given: rest.join(',').trim() };
  }
  const parts = s.split(' ');
  if (parts.length === 1) return { family: s, given: '' };
  let i = parts.length - 1;
  while (i > 1 && /^(van|von|der|den|de|del|della|di|da|la|le|du|dos|das|ter|ten)$/i.test(parts[i - 1])) i--;
  return { family: parts.slice(i).join(' '), given: parts.slice(0, i).join(' ') };
}

/** "Ashish Nagaraj" → "A. N."; already-initialed names are kept. Hyphenated names keep the hyphen: "J.-P.". */
export function initials(given: string): string {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split('-')
        .map((p) => (p.endsWith('.') && p.length <= 3 ? p : `${p.charAt(0).toUpperCase()}.`))
        .join('-'),
    )
    .join(' ');
}

/** The family name's ASCII form, for citation keys. */
export function asciiFamily(name: string): string {
  return parseName(name)
    .family.normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '');
}
