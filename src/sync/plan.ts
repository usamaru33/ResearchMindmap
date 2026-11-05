// Deciding what to copy between this device and Google Drive (DESIGN 16.2).
// Pure: it only compares update times, so every case is testable.

/** `id → updatedAt` of a project as it was when the two sides were last made equal. */
export type SyncBase = Record<string, string>;

export interface SyncPlan {
  /** Local projects to write to Drive (new or newer). */
  upload: string[];
  /** Drive projects to write here (new or newer). */
  download: string[];
  /** Deleted on another device and not changed here since. */
  deleteLocal: string[];
  /** Deleted here and not changed on Drive since. */
  deleteRemote: string[];
  /** Changed on both sides: Drive's copy comes down as a new project, ours goes up. */
  conflicts: string[];
  /** Already equal. */
  same: string[];
}

export function planSync(local: Record<string, string>, remote: Record<string, string>, base: SyncBase): SyncPlan {
  const plan: SyncPlan = { upload: [], download: [], deleteLocal: [], deleteRemote: [], conflicts: [], same: [] };
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[id];
    const r = remote[id];
    const b = base[id];
    if (l !== undefined && r === undefined) {
      // Never synced, or changed since: send it. Unchanged since the last sync: Drive's copy was deleted.
      (b === undefined || l !== b ? plan.upload : plan.deleteLocal).push(id);
    } else if (l === undefined && r !== undefined) {
      (b === undefined || r !== b ? plan.download : plan.deleteRemote).push(id);
    } else if (l !== undefined && r !== undefined) {
      if (l === r) {
        plan.same.push(id);
        continue;
      }
      // Without a record of the last sync, neither side can be called the older one.
      const localChanged = b === undefined || l !== b;
      const remoteChanged = b === undefined || r !== b;
      if (localChanged && remoteChanged) plan.conflicts.push(id);
      else if (localChanged) plan.upload.push(id);
      else plan.download.push(id);
    }
  }
  return plan;
}
