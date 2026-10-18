import { describe, expect, it } from 'vitest';
import { matchScore, rankItems, type PaletteItem } from './palette';

const cmd = (id: string, label: string, keywords = ''): PaletteItem => ({ id, kind: 'command', label, keywords });
const paper = (id: string, label: string, detail: string): PaletteItem => ({ id, kind: 'paper', label, detail });

const items = [
  cmd('search', '検索を開く', 'Open search'),
  cmd('library', 'ライブラリを開く', 'Open library'),
  cmd('bib', '.bib に書き出す', 'Export BibTeX'),
  paper('a', 'Attention Is All You Need', 'Vaswani, A. · 2017'),
  paper('b', 'BERT: Pre-training of Deep Bidirectional Transformers', 'Devlin, J. · 2019'),
];

describe('command palette matching', () => {
  it('needs every word, in the label or elsewhere', () => {
    expect(matchScore('検索', items[0])).toBe(0);
    expect(matchScore('open lib', items[1])).toBe(8);
    expect(matchScore('vaswani 2017', items[3])).toBe(8);
    expect(matchScore('vaswani 2019', items[3])).toBeNull();
  });

  it('ignores case, accents and full-width letters', () => {
    expect(matchScore('ＢＥＲＴ', items[4])).toBe(0);
    expect(matchScore('attention', items[3])).toBe(0);
  });

  it('ranks label starts first and lists commands before papers', () => {
    expect(rankItems(items, 'b').map((i) => i.id)).toEqual(['bib', 'library', 'b']);
    expect(rankItems(items, 'open').map((i) => i.id)).toEqual(['search', 'library']);
    expect(rankItems(items, '').map((i) => i.id)).toEqual(['search', 'library', 'bib', 'a', 'b']);
    expect(rankItems(items, '', 1).map((i) => i.id)).toEqual(['search', 'a']);
  });
});
