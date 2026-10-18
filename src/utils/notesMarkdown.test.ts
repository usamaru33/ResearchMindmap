import { afterEach, describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { setCurrentLang } from '../i18n/current';
import { noteFileName, notesMarkdown, obsidianNotes } from './notesMarkdown';

const attention = makePaper({
  id: 'a',
  title: 'Attention Is All You Need',
  authors: ['Ashish Vaswani', 'Noam Shazeer'],
  year: 2017,
  venue: 'NeurIPS',
  abstract: 'We propose the Transformer.\nIt is fast.',
  ids: { arxiv: '1706.03762' },
  status: 'read',
  rating: 4,
  tags: ['core idea'],
  notes: 'Read twice.',
  comparison: { Method: 'Self-attention', Data: '' },
});
const bert = makePaper({ id: 'b', title: 'BERT', authors: ['Devlin, Jacob'], year: 2019, references: ['a'], ids: { doi: '10.18653/v1/n19-1423' }, citeKey: 'Devlin:2019' });
const opts = { projectName: 'NLP: review', aspects: ['Method', 'Data'], date: new Date('2026-10-18T00:00:00Z') };

afterEach(() => setCurrentLang('ja'));

describe('literature notes', () => {
  it('writes one Markdown file, oldest first, with the user data', () => {
    setCurrentLang('en');
    const md = notesMarkdown([bert, attention], opts);
    expect(md.startsWith('# NLP: review — literature notes\n\n2 papers · exported 2026-10-18\n')).toBe(true);
    expect(md.indexOf('## Vaswani et al. (2017) Attention Is All You Need')).toBeLessThan(md.indexOf('## Devlin (2019) BERT'));
    expect(md).toContain('- Links: [arXiv:1706.03762](https://arxiv.org/abs/1706.03762)');
    expect(md).toContain('- Citation key: `vaswani2017attention`');
    expect(md).toContain('- Status: Read · ★★★★☆ · #core-idea');
    expect(md).toContain('- Method: Self-attention');
    expect(md).not.toContain('- Data:');
    expect(md).toContain('**Notes**\n\nRead twice.');
    expect(md).toContain('> We propose the Transformer.\n> It is fast.');
    expect(md).toContain('- Cited by: Devlin (2019) BERT');
    expect(md).toContain('- Links: [doi:10.18653/v1/n19-1423](https://doi.org/10.18653/v1/n19-1423)');
  });

  it('writes an Obsidian folder with front matter and links between notes', () => {
    setCurrentLang('en');
    const files = obsidianNotes([attention, bert], opts);
    expect(files.map((f) => f.name)).toEqual(['NLP_ review/_index.md', 'NLP_ review/vaswani2017attention.md', 'NLP_ review/Devlin_2019.md']);
    const note = files[2].content;
    expect(note.startsWith('---\ntitle: "BERT"\nauthors: ["Devlin, Jacob"]\nyear: 2019\ncitekey: "Devlin:2019"\ndoi: "10.18653/v1/n19-1423"\nstatus: unread\ntags: []\n---\n\n# BERT\n')).toBe(true);
    expect(note).toContain('- Cites: [[vaswani2017attention|Vaswani et al. (2017)]]');
    expect(files[1].content).toContain('rating: 4\ntags: ["core-idea"]');
    expect(files[0].content).toContain('- [[Devlin_2019|Devlin (2019)]] BERT');
  });

  it('uses the UI language for labels', () => {
    expect(notesMarkdown([attention], opts)).toContain('- 引用キー: `vaswani2017attention`');
  });

  it('makes safe file names', () => {
    expect(noteFileName('Smith:2020/a?')).toBe('Smith_2020_a_');
  });
});
