import { describe, expect, it } from 'vitest';
import { ProjectStore, createProject, serializeProjectFile, type KeyValueStorage, type Project } from '../store/projects';
import type { Remote } from './drive';
import type { SyncBase } from './plan';
import { runSync } from './run';

function memory(): KeyValueStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

/** Drive, in memory. */
function fakeDrive() {
  const files = new Map<string, { id: string; text: string; updatedAt: string }>();
  let n = 0;
  const remote: Remote = {
    list: async () => [...files].map(([fileId, f]) => ({ fileId, id: f.id, updatedAt: f.updatedAt })),
    read: async (fileId) => files.get(fileId)!.text,
    write: async (id, text, updatedAt, fileId) => {
      const key = fileId ?? `file-${++n}`;
      files.set(key, { id, text, updatedAt });
      return key;
    },
    remove: async (fileId) => void files.delete(fileId),
  };
  return { remote, files };
}

/** One device: its own local store and the record of its last sync. */
function device(drive: ReturnType<typeof fakeDrive>) {
  const store = new ProjectStore(memory());
  let base: SyncBase = {};
  return {
    store,
    sync: async () => {
      const res = await runSync(store, drive.remote, base);
      base = res.base;
      return res;
    },
  };
}

/** Edit a project; `minutes` after its last change, so two devices never share a time. */
const edit = (store: ProjectStore, id: string, patch: Partial<Project>, minutes = 1) => {
  const p = store.load(id)!;
  store.save({ ...p, ...patch, updatedAt: new Date(Date.parse(p.updatedAt) + minutes * 60_000).toISOString() });
};

describe('runSync across two devices', () => {
  it('sends a new project up and brings it down on the other device', async () => {
    const drive = fakeDrive();
    const [a, b] = [device(drive), device(drive)];
    const project = createProject('Embodiment');
    a.store.save(project);

    expect(await a.sync()).toMatchObject({ uploaded: 1, downloaded: 0 });
    expect(drive.files.size).toBe(1);
    const res = await b.sync();
    expect(res).toMatchObject({ uploaded: 0, downloaded: 1, changed: [project.id] });
    const [onA, onB] = [a.store.load(project.id)!, b.store.load(project.id)!];
    expect([onB.name, onB.updatedAt, onB.nodes, onB.edges]).toEqual([onA.name, onA.updatedAt, onA.nodes, onA.edges]);
  });

  it('does nothing when both sides already agree', async () => {
    const drive = fakeDrive();
    const [a, b] = [device(drive), device(drive)];
    a.store.save(createProject('Embodiment'));
    await a.sync();
    await b.sync();
    for (const d of [a, b, a]) expect(await d.sync()).toMatchObject({ uploaded: 0, downloaded: 0, deleted: 0, conflicts: 0, changed: [] });
  });

  it('carries an edit to the other device', async () => {
    const drive = fakeDrive();
    const [a, b] = [device(drive), device(drive)];
    const project = createProject('Embodiment');
    a.store.save(project);
    await a.sync();
    await b.sync();

    edit(a.store, project.id, { name: 'Embodiment v2' });
    await a.sync();
    expect(await b.sync()).toMatchObject({ downloaded: 1, uploaded: 0 });
    expect(b.store.load(project.id)?.name).toBe('Embodiment v2');
  });

  it('carries a deletion to the other device', async () => {
    const drive = fakeDrive();
    const [a, b] = [device(drive), device(drive)];
    const project = createProject('Old');
    a.store.save(project);
    await a.sync();
    await b.sync();

    a.store.remove(project.id);
    expect(await a.sync()).toMatchObject({ deleted: 1 });
    expect(drive.files.size).toBe(0);
    expect(await b.sync()).toMatchObject({ deleted: 1, changed: [project.id] });
    expect(b.store.load(project.id)).toBeNull();
  });

  it('keeps both versions when a project was edited on both devices', async () => {
    const drive = fakeDrive();
    const [a, b] = [device(drive), device(drive)];
    const project = createProject('Embodiment');
    a.store.save(project);
    await a.sync();
    await b.sync();

    edit(a.store, project.id, { name: 'From A' });
    edit(b.store, project.id, { name: 'From B' }, 2);
    await a.sync(); // A reaches Drive first
    const res = await b.sync();

    expect(res.conflicts).toBe(1);
    const names = b.store.list().map((p) => p.name).sort();
    expect(names).toHaveLength(2);
    expect(names).toContain('From B'); // B's own edit is still there, under the same ID
    expect(b.store.load(project.id)?.name).toBe('From B');
    expect(names.find((n) => n !== 'From B')).toMatch(/^From A/); // A's version, as a copy
    // B's version is now on Drive, so A receives it; the copy goes up on the next run.
    await a.sync();
    expect(a.store.load(project.id)?.name).toBe('From B');
  });

  it('does not overwrite a project edited while the sync was running', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    const project = createProject('Embodiment');
    a.store.save(project);
    await a.sync();
    const b = device(drive);
    await b.sync();
    edit(a.store, project.id, { name: 'Edited on A' });
    await a.sync();

    // B edits right after its sync has listed Drive, before the download is written.
    const racing = {
      list: () => {
        const listed = b.store.list();
        edit(b.store, project.id, { name: 'Typed on B meanwhile' });
        return listed;
      },
      load: (id: string) => b.store.load(id),
      save: (p: Project) => b.store.save(p),
      remove: (id: string) => b.store.remove(id),
    };
    let calls = 0;
    const local = { ...racing, list: () => (calls++ === 0 ? b.store.list() : (racing.list(), b.store.list())) };
    const res = await runSync(local, drive.remote, { [project.id]: project.updatedAt });
    expect(res.skipped).toBe(1);
    expect(b.store.load(project.id)?.name).toBe('Typed on B meanwhile');
  });

  it('skips a file that is not a project and syncs the rest', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    drive.files.set('junk', { id: 'junk', text: 'not json', updatedAt: '2026-11-01T00:00:00.000Z' });
    const project = createProject('Embodiment');
    drive.files.set('good', { id: project.id, text: serializeProjectFile(project), updatedAt: project.updatedAt });

    const res = await a.sync();
    expect(res).toMatchObject({ downloaded: 1, unreadable: 1 });
    expect(a.store.load(project.id)?.name).toBe('Embodiment');
    expect(a.store.load('junk')).toBeNull();
  });

  it('keeps the ID and update time Drive lists, whatever the file says', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    const project = createProject('Embodiment');
    drive.files.set('f', { id: 'listed-id', text: serializeProjectFile({ ...project, id: 'other', updatedAt: '2000-01-01T00:00:00.000Z' }), updatedAt: '2026-11-05T00:00:00.000Z' });
    await a.sync();
    expect(a.store.load('listed-id')?.updatedAt).toBe('2026-11-05T00:00:00.000Z');
    expect(a.store.load('other')).toBeNull();
    expect(await a.sync()).toMatchObject({ uploaded: 0, downloaded: 0 });
  });
});
