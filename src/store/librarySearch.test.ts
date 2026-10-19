import { describe, expect, it } from 'vitest';
import type { Paper } from '../types';
import { foldText, paperForCopy, searchLibrary, type LibrarySource } from './librarySearch';

function paper(id: string, title: string, extra: Partial<Paper> = {}): Paper {
  return {
    id,
    title,
    authors: ['Ada Lovelace'],
    belongs: '',
    year: 2020,
    venue: 'CHI',
    abstract: '',
    challenges: '',
    futureWork: '',
    references: [],
    ...extra,
  };
}

const vr = paper('doi:10.1/vr', 'Body Ownership in Virtual Reality Avatars', { tags: ['vr'], notes: '重要な先行研究' });
const haptics = paper('p2', 'Haptic Feedback for Mid-Air Gestures', { authors: ['Grace Hopper'], year: 2018 });
const vrCopy = paper('doi:10.1/vr', 'Body ownership in virtual reality avatars', { screening: { decision: 'include' } });
const sources: LibrarySource[] = [
  { projectId: 'b', projectName: 'Haptics survey', current: false, papers: [haptics, vrCopy] },
  { projectId: 'a', projectName: 'VR study', current: true, papers: [vr] },
];

describe('searchLibrary', () => {
  it('needs every word, in any field, ignoring case and accents', () => {
    expect(searchLibrary(sources, 'virtual AVATARS').map((h) => h.paper.id)).toEqual(['doi:10.1/vr']);
    expect(searchLibrary(sources, 'hopper 2018').map((h) => h.paper.id)).toEqual(['p2']);
    expect(searchLibrary(sources, 'haptic avatars')).toEqual([]);
    expect(searchLibrary(sources, '先行研究').map((h) => h.paper.id)).toEqual(['doi:10.1/vr']);
  });

  it('shows a work found in several projects once, from the open project', () => {
    const [hit] = searchLibrary(sources, 'body ownership');
    expect(hit.paper).toBe(vr);
    expect(hit.inCurrent).toBe(true);
    expect(hit.projects.map((p) => p.name)).toEqual(['VR study', 'Haptics survey']);
  });

  it('knows a work is in the open project even when only another copy matches', () => {
    const hits = searchLibrary(sources, 'body', 'b');
    expect(hits).toHaveLength(1);
    expect(hits[0].inCurrent).toBe(true);
    expect(hits[0].projects.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('ranks title matches above matches elsewhere, and lists everything for an empty query', () => {
    const a = paper('x', 'Gestures', { abstract: 'about avatars' });
    const b = paper('y', 'Avatars');
    const hits = searchLibrary([{ projectId: 'c', projectName: 'C', current: true, papers: [a, b] }], 'avatars');
    expect(hits.map((h) => h.paper.id)).toEqual(['y', 'x']);
    expect(searchLibrary(sources, '  ').map((h) => h.paper.id)).toEqual(['doi:10.1/vr', 'p2']);
  });

  it('folds full-width text but keeps kana voicing', () => {
    expect(foldText('ＶＲ　Ｓｔｕｄｙ')).toBe('vr study');
    expect(foldText('ガイド')).not.toBe(foldText('カイト'));
  });

  it('drops screening decisions when copying to another project', () => {
    expect(paperForCopy(vrCopy).screening).toBeUndefined();
    expect(vrCopy.screening).toBeDefined();
  });
});
