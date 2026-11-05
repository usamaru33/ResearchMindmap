// Carrying out a sync plan between the local ProjectStore and Drive (DESIGN 16.2).
// Both sides are passed in, so the whole run is testable without Google.

import { tr } from '../i18n/current';
import {
  ProjectImportError,
  parseProjectFile,
  projectFileName,
  serializeProjectFile,
  uniqueName,
  type Project,
  type ProjectSummary,
} from '../store/projects';
import { DriveError, type Remote, type RemoteFile } from './drive';
import { planSync, type SyncBase } from './plan';

export interface LocalProjects {
  list(): ProjectSummary[];
  load(id: string): Project | null;
  save(project: Project): boolean;
  remove(id: string): void;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  deleted: number;
  /** Changed on both sides; the other device's version was kept as a new project. */
  conflicts: number;
  /** Edited here but only readable on Drive: the edits were kept as a separate project. */
  forked: number;
  /** Edited here while the sync ran, so left for the next one. */
  skipped: number;
  /** Files on Drive that could not be read as projects. */
  unreadable: number;
  /** IDs of local projects that were replaced, added or removed. */
  changed: string[];
  /** What both sides agree on now; saved for the next run. */
  base: SyncBase;
}

/** A project file from Drive, kept under `id` and stamped with the time Drive lists for it. */
function fromRemote(text: string, id: string, updatedAt: string): Project {
  return { ...parseProjectFile(text, updatedAt), id, updatedAt };
}

export async function runSync(local: LocalProjects, remote: Remote, base: SyncBase): Promise<SyncResult> {
  const remoteFiles = new Map<string, RemoteFile>((await remote.list()).map((f) => [f.id, f]));
  const localTimes = Object.fromEntries(local.list().map((p) => [p.id, p.updatedAt]));
  const plan = planSync(localTimes, Object.fromEntries([...remoteFiles].map(([id, f]) => [id, f.updatedAt])), base);

  const result: SyncResult = { uploaded: 0, downloaded: 0, deleted: 0, conflicts: 0, forked: 0, skipped: 0, unreadable: 0, changed: [], base: {} };
  const next = result.base;
  for (const id of plan.same) next[id] = localTimes[id];

  // Edited here since the plan was made: leave it for the next run rather than overwrite the edit.
  const editedSince = (id: string) => local.list().find((p) => p.id === id)?.updatedAt !== localTimes[id];
  const keepBase = (id: string) => {
    if (base[id] !== undefined) next[id] = base[id];
  };
  const read = async (file: RemoteFile, id: string, name?: string): Promise<Project | null> => {
    try {
      const project = fromRemote(await remote.read(file.fileId), id, file.updatedAt);
      return name ? { ...project, name } : project;
    } catch (err) {
      // A broken file is skipped; a failing connection or sign-in stops the whole sync.
      if (err instanceof DriveError) throw err;
      if (err instanceof ProjectImportError || err instanceof SyntaxError) {
        result.unreadable++;
        return null;
      }
      throw err;
    }
  };
  const upload = async (id: string) => {
    const project = local.load(id);
    if (!project) return;
    await remote.write(id, serializeProjectFile(project), project.updatedAt, remoteFiles.get(id)?.fileId, projectFileName(project.name));
    next[id] = project.updatedAt;
    result.uploaded++;
  };

  // A file we may only read cannot take our edits: keep them as a project of our own, then take Drive's version.
  const readOnly = (id: string) => remoteFiles.get(id)?.canEdit === false;
  const forks = [...plan.upload, ...plan.conflicts].filter(readOnly);
  plan.upload = plan.upload.filter((id) => !readOnly(id));
  plan.conflicts = plan.conflicts.filter((id) => !readOnly(id));
  for (const id of forks) {
    const mine = local.load(id);
    if (!mine || editedSince(id)) {
      result.skipped++;
      keepBase(id);
      continue;
    }
    const fork = { ...mine, id: crypto.randomUUID(), name: uniqueName(`${mine.name}${tr('sync.copySuffix')}`, local.list().map((p) => p.name)) };
    if (!local.save(fork)) throw new Error(tr('error.storage'));
    result.changed.push(fork.id);
    result.forked++;
    plan.download.push(id);
    // Drive's version replaces ours below, so the edit check must not see the copy as a change.
    localTimes[id] = local.list().find((p) => p.id === id)?.updatedAt ?? localTimes[id];
  }

  for (const id of plan.download) {
    if (localTimes[id] !== undefined && editedSince(id)) {
      result.skipped++;
      keepBase(id);
      continue;
    }
    const file = remoteFiles.get(id)!;
    const project = await read(file, id);
    if (!project) continue;
    if (!local.save(project)) throw new Error(tr('error.storage'));
    next[id] = file.updatedAt;
    result.downloaded++;
    result.changed.push(id);
  }

  for (const id of plan.conflicts) {
    const taken = local.list().map((p) => p.name);
    const file = remoteFiles.get(id)!;
    const copy = await read(file, crypto.randomUUID());
    if (copy) {
      const named = { ...copy, name: uniqueName(`${copy.name}${tr('sync.copySuffix')}`, taken) };
      if (!local.save(named)) throw new Error(tr('error.storage'));
      result.changed.push(named.id);
      result.conflicts++;
    }
    // The copy is not on Drive yet (no entry in `next`), so the next run uploads it as a new project.
    await upload(id);
  }

  for (const id of plan.upload) await upload(id);

  for (const id of plan.deleteRemote) {
    // Someone else's file stays: removing it here must not remove it for everyone.
    if (!remoteFiles.get(id)!.ownedByMe) {
      keepBase(id);
      continue;
    }
    await remote.remove(remoteFiles.get(id)!.fileId);
    result.deleted++;
  }
  for (const id of plan.deleteLocal) {
    if (editedSince(id)) {
      result.skipped++;
      keepBase(id);
      continue;
    }
    local.remove(id);
    result.deleted++;
    result.changed.push(id);
  }
  return result;
}
