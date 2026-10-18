import { tr } from '../i18n/current';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapSnapshot, MindMapState } from '../types';
import type { UndoAction } from '../store/undo';
import {
  ProjectStore,
  createProject,
  parseProjectFile,
  projectFileName,
  sanitizeEdges,
  sanitizeNodes,
  serializeProjectFile,
  uniqueName,
  type KeyValueStorage,
  type Project,
  type ProjectSummary,
} from '../store/projects';

const SAVE_DELAY_MS = 500;

function browserStorage(): KeyValueStorage {
  try {
    const probe = '__rmm_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Private mode or blocked storage: keep projects in memory for this session.
    const data = new Map<string, string>();
    return {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    };
  }
}

export const projectStore = new ProjectStore(browserStorage());

/** Load the last active project, or create one from `createDefault` on first run. */
export function loadInitialProject(createDefault: () => Project): Project {
  const activeId = projectStore.getActiveId();
  const active = activeId ? projectStore.load(activeId) : null;
  if (active) return active;
  const latest = projectStore.list()[0];
  const fallback = latest ? projectStore.load(latest.id) : null;
  const project = fallback ?? createDefault();
  projectStore.save(project);
  projectStore.setActiveId(project.id);
  return project;
}

function toSnapshot(project: Project): MapSnapshot {
  return {
    nodes: project.nodes,
    edges: project.edges,
    layoutDirection: project.layoutDirection,
    aspects: project.aspects,
    history: project.history,
  };
}

type ProjectMeta = Pick<Project, 'id' | 'name' | 'createdAt'>;

export function useProjects(
  initial: Project,
  state: MindMapState,
  dispatch: React.Dispatch<UndoAction>,
) {
  const [meta, setMeta] = useState<ProjectMeta>({
    id: initial.id,
    name: initial.name,
    createdAt: initial.createdAt,
  });
  const [projects, setProjects] = useState<ProjectSummary[]>(() => projectStore.list());
  const [saveError, setSaveError] = useState<string | null>(null);

  const buildProject = useCallback(
    (m: ProjectMeta): Project => ({
      schemaVersion: initial.schemaVersion,
      ...m,
      updatedAt: new Date().toISOString(),
      nodes: sanitizeNodes(state.nodes),
      edges: sanitizeEdges(state.edges),
      layoutDirection: state.layoutDirection,
      aspects: state.aspects,
      history: state.history,
    }),
    [initial.schemaVersion, state.nodes, state.edges, state.layoutDirection, state.aspects, state.history],
  );

  const saveNow = useCallback(
    (m: ProjectMeta = meta) => {
      const ok = projectStore.save(buildProject(m));
      setSaveError(ok ? null : tr('error.storageFull'));
      setProjects(projectStore.list());
    },
    [buildProject, meta],
  );

  // Debounced autosave of the current map.
  const saveRef = useRef(saveNow);
  useEffect(() => {
    saveRef.current = saveNow;
  }, [saveNow]);
  useEffect(() => {
    const timer = window.setTimeout(() => saveRef.current(), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state.nodes, state.edges, state.layoutDirection, state.aspects, state.history]);

  const activate = useCallback(
    (project: Project) => {
      projectStore.setActiveId(project.id);
      setMeta({ id: project.id, name: project.name, createdAt: project.createdAt });
      dispatch({ type: 'LOAD_MAP', payload: toSnapshot(project) });
      setProjects(projectStore.list());
    },
    [dispatch],
  );

  const switchTo = useCallback(
    (id: string) => {
      if (id === meta.id) return;
      saveNow();
      const project = projectStore.load(id);
      if (project) activate(project);
    },
    [meta.id, saveNow, activate],
  );

  const createNew = useCallback(
    (name = 'Untitled map', initial?: MapSnapshot) => {
      saveNow();
      const project = createProject(
        uniqueName(name, projectStore.list().map((p) => p.name)),
        initial?.nodes,
        initial?.edges,
        initial?.layoutDirection,
      );
      projectStore.save(project);
      activate(project);
    },
    [saveNow, activate],
  );

  const rename = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed === meta.name) return;
      const next = { ...meta, name: trimmed };
      setMeta(next);
      saveNow(next);
    },
    [meta, saveNow],
  );

  const removeActive = useCallback(() => {
    projectStore.remove(meta.id);
    const next = projectStore.list()[0];
    const project = next ? projectStore.load(next.id) : null;
    if (project) {
      activate(project);
    } else {
      const fresh = createProject('Untitled map');
      projectStore.save(fresh);
      activate(fresh);
    }
  }, [meta.id, activate]);

  const exportActive = useCallback(() => {
    const project = buildProject(meta);
    const blob = new Blob([serializeProjectFile(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = projectFileName(project.name);
    a.click();
    URL.revokeObjectURL(url);
  }, [buildProject, meta]);

  /** Import a project file as a new project. Throws ProjectImportError on bad input. */
  const importFile = useCallback(
    async (file: File) => {
      const parsed = parseProjectFile(await file.text());
      const project = { ...parsed, name: uniqueName(parsed.name, projectStore.list().map((p) => p.name)) };
      saveNow();
      if (!projectStore.save(project)) {
        throw new Error(tr('error.storage'));
      }
      activate(project);
    },
    [saveNow, activate],
  );

  return {
    activeProject: meta,
    projects,
    saveError,
    switchTo,
    createNew,
    rename,
    removeActive,
    exportActive,
    importFile,
  };
}
