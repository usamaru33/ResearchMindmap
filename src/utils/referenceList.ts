// Splitting a pasted bibliography into one string per reference.

const HEADING = /^(references|bibliography|works cited|literature cited|参考文献|引用文献)\s*:?$/i;
// "[12] …", "12. …", "12) …" at the start of a line.
const NUMBERED = /^\s*(?:\[\d{1,3}\]|\d{1,3}[.)])\s+/;
// A line that starts like an author list: "He, K.", "Botvinick M,", "A. Vaswani,", "Ashish Vaswani,".
const AUTHOR_START =
  /^(?:\p{Lu}[\p{L}'’-]+,\s+\p{Lu}|\p{Lu}[\p{L}'’-]+\s+\p{Lu}{1,3}[,.]|\p{Lu}\.(?:\s?\p{Lu}\.)*\s+\p{Lu}[\p{L}'’-]+[, ]|\p{Lu}\p{Ll}+\s+(?:\p{Lu}\.\s+)?\p{Lu}[\p{L}'’-]+,)/u;

/** Join lines broken by PDF copying: "recog-" + "nition" → "recognition". */
function joinLines(parts: string[]): string {
  let out = '';
  for (const part of parts) {
    if (!out) out = part;
    else if (/\p{Ll}-$/u.test(out) && /^\p{Ll}/u.test(part)) out = out.slice(0, -1) + part;
    // A URL or DOI broken after a slash, hyphen or dot (a new sentence would start with a capital).
    else if (/(?:https?:\/\/|10\.\d{4,}\/)\S*[/.-]$/i.test(out) && (!out.endsWith('.') || /^[\p{Ll}\d_]/u.test(part))) out += part;
    else out = `${out} ${part}`;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * One string per reference. Numbered lists split at the numbers; otherwise blank lines
 * separate entries when there are any; otherwise a new entry starts where a line begins
 * like an author list right after a line that ended a sentence. Lines in between are
 * continuation lines and are joined back. With none of these cues, each line is one entry.
 */
export function splitReferences(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => !HEADING.test(l));
  const nonEmpty = lines.filter(Boolean);
  if (nonEmpty.length === 0) return [];

  const groups: string[][] = [];
  const numbered = nonEmpty.filter((l) => NUMBERED.test(l)).length;
  if (numbered >= 2 || (numbered === 1 && nonEmpty.length === 1)) {
    for (const line of nonEmpty) {
      if (NUMBERED.test(line) || groups.length === 0) groups.push([line]);
      else groups[groups.length - 1].push(line);
    }
  } else if (lines.some((l, i) => !l && i > 0 && i < lines.length - 1)) {
    let current: string[] = [];
    for (const line of lines) {
      if (line) current.push(line);
      else if (current.length) {
        groups.push(current);
        current = [];
      }
    }
    if (current.length) groups.push(current);
  } else if (nonEmpty.slice(1).some((l) => AUTHOR_START.test(l))) {
    for (const line of nonEmpty) {
      const prev = groups[groups.length - 1];
      const prevLine = prev?.[prev.length - 1] ?? '';
      const ended = /[.)\]]$|\d$/.test(prevLine);
      if (!prev || (ended && AUTHOR_START.test(line))) groups.push([line]);
      else prev.push(line);
    }
  } else {
    for (const line of nonEmpty) groups.push([line]);
  }
  return groups.map((g) => joinLines(g).replace(NUMBERED, '').trim()).filter(Boolean);
}
