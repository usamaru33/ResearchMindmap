// Carrying out a sync plan between the local ProjectStore and Drive (DESIGN 16.2).
// Both sides are passed in, so the whole run is testable without Google.

import { tr } from '../i18n/current';
import {
  ProjectImportError,
  parseProjectFile,
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

  const result: SyncResult = { uploaded: 0, downloaded: 0, deleted: 0, conflicts: 0, skipped: 0, unreadable: 0, changed: [], base: {} };
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
    await remote.write(id, serializeProjectFile(project), project.updatedAt, remoteFiles.get(id)?.fileId);
    next[id] = project.updatedAt;
    result.uploaded++;
  };

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
