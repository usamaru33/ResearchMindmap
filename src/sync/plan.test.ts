import { describe, expect, it } from 'vitest';
import { planSync } from './plan';

const empty = { upload: [], download: [], deleteLocal: [], deleteRemote: [], conflicts: [], same: [] };
const T1 = '2026-11-01T00:00:00.000Z';
const T2 = '2026-11-02T00:00:00.000Z';
const T3 = '2026-11-03T00:00:00.000Z';

describe('planSync', () => {
  it('does nothing for two empty sides', () => {
    expect(planSync({}, {}, {})).toEqual(empty);
  });

  it('uploads a project that is only here, and downloads one that is only on Drive', () => {
    expect(planSync({ a: T1 }, {}, {})).toEqual({ ...empty, upload: ['a'] });
    expect(planSync({}, { a: T1 }, {})).toEqual({ ...empty, download: ['a'] });
  });

  it('deletes here what another device deleted, if it did not change here since', () => {
    expect(planSync({ a: T1 }, {}, { a: T1 })).toEqual({ ...empty, deleteLocal: ['a'] });
  });

  it('keeps (uploads) a project that changed here after another device deleted it', () => {
    expect(planSync({ a: T2 }, {}, { a: T1 })).toEqual({ ...empty, upload: ['a'] });
  });

  it('deletes on Drive what was deleted here, if it did not change on Drive since', () => {
    expect(planSync({}, { a: T1 }, { a: T1 })).toEqual({ ...empty, deleteRemote: ['a'] });
  });

  it('brings back (downloads) a project that changed on Drive after it was deleted here', () => {
    expect(planSync({}, { a: T2 }, { a: T1 })).toEqual({ ...empty, download: ['a'] });
  });

  it('leaves equal projects alone', () => {
    expect(planSync({ a: T2 }, { a: T2 }, { a: T1 })).toEqual({ ...empty, same: ['a'] });
    expect(planSync({ a: T2 }, { a: T2 }, {})).toEqual({ ...empty, same: ['a'] });
  });

  it('sends the side that changed since the last sync', () => {
    expect(planSync({ a: T2 }, { a: T1 }, { a: T1 })).toEqual({ ...empty, upload: ['a'] });
    expect(planSync({ a: T1 }, { a: T2 }, { a: T1 })).toEqual({ ...empty, download: ['a'] });
  });

  it('flags a project changed on both sides, whichever is newer', () => {
    expect(planSync({ a: T2 }, { a: T3 }, { a: T1 })).toEqual({ ...empty, conflicts: ['a'] });
    expect(planSync({ a: T3 }, { a: T2 }, { a: T1 })).toEqual({ ...empty, conflicts: ['a'] });
  });

  it('treats a project on both sides with no sync record and different times as a conflict', () => {
    expect(planSync({ a: T1 }, { a: T2 }, {})).toEqual({ ...empty, conflicts: ['a'] });
  });

  it('plans each project on its own', () => {
    const plan = planSync({ a: T1, b: T2, c: T1 }, { b: T2, c: T3, d: T1 }, { a: T1, c: T1 });
    expect(plan).toEqual({ upload: [], download: ['c', 'd'], deleteLocal: ['a'], deleteRemote: [], conflicts: [], same: ['b'] });
  });
});
