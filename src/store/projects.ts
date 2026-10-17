import type { LayoutDirection, PaperEdge, PaperNode } from '../types';

export const PROJECT_SCHEMA_VERSION = 1;
const PREFIX = 'rmm:v1:';
const INDEX_KEY = `${PREFIX}index`;
const ACTIVE_KEY = `${PREFIX}active`;
const projectKey = (id: string) => `${PREFIX}project:${id}`;

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  paperCount: number;
}

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodes: PaperNode[];
  edges: PaperEdge[];
  layoutDirection: LayoutDirection;
}

/** Minimal Storage interface so tests can pass an in-memory implementation. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Strip React Flow runtime fields (measurements, selection) before saving. */
export function sanitizeNodes(nodes: PaperNode[]): PaperNode[] {
  return nodes.map(({ id, type, position, data }) => ({
    id,
    type,
    position: { x: position.x, y: position.y },
    data,
  }));
}

export function sanitizeEdges(edges: PaperEdge[]): PaperEdge[] {
  return edges.map((edge) => {
    const copy = { ...edge };
    delete copy.selected;
    return copy;
  });
}

export function createProject(
  name: string,
  nodes: PaperNode[] = [],
  edges: PaperEdge[] = [],
  layoutDirection: LayoutDirection = 'LR',
  now = new Date().toISOString(),
): Project {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    nodes: sanitizeNodes(nodes),
    edges: sanitizeEdges(edges),
    layoutDirection,
  };
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class ProjectStore {
  private readonly storage: KeyValueStorage;

  constructor(storage: KeyValueStorage) {
    this.storage = storage;
  }

  list(): ProjectSummary[] {
    const index = safeParse<ProjectSummary[]>(this.storage.getItem(INDEX_KEY)) ?? [];
    return [...index].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  load(id: string): Project | null {
    const project = safeParse<Project>(this.storage.getItem(projectKey(id)));
    return project ? migrateProject(project) : null;
  }

  /** Persist a project and update the index. Returns false if storage is full or unavailable. */
  save(project: Project): boolean {
    try {
      this.storage.setItem(projectKey(project.id), JSON.stringify(project));
      const summary: ProjectSummary = {
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
        paperCount: project.nodes.filter((n) => n.type === 'paper').length,
      };
      const index = this.list().filter((p) => p.id !== project.id);
      this.storage.setItem(INDEX_KEY, JSON.stringify([summary, ...index]));
      return true;
    } catch {
      return false;
    }
  }

  remove(id: string): void {
    this.storage.removeItem(projectKey(id));
    this.storage.setItem(INDEX_KEY, JSON.stringify(this.list().filter((p) => p.id !== id)));
    if (this.getActiveId() === id) this.storage.removeItem(ACTIVE_KEY);
  }

  getActiveId(): string | null {
    return this.storage.getItem(ACTIVE_KEY);
  }

  setActiveId(id: string): void {
    this.storage.setItem(ACTIVE_KEY, id);
  }
}

/** Upgrade older saved projects. Only v1 exists so far. */
export function migrateProject(project: Project): Project {
  return { ...project, schemaVersion: PROJECT_SCHEMA_VERSION };
}

export class ProjectImportError extends Error {}

/** Parse an exported project file. A fresh id is assigned so imports never overwrite. */
export function parseProjectFile(text: string, now = new Date().toISOString()): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectImportError('JSON として読み込めません');
  }
  const p = raw as Partial<Project>;
  if (!p || typeof p !== 'object' || !Array.isArray(p.nodes) || !Array.isArray(p.edges)) {
    throw new ProjectImportError('Research Mind Map のプロジェクトファイルではありません');
  }
  for (const node of p.nodes) {
    if (!node || typeof node.id !== 'string' || !node.data || !node.position) {
      throw new ProjectImportError('ノードの形式が正しくありません');
    }
  }
  return migrateProject({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name: typeof p.name === 'string' && p.name ? p.name : 'Imported project',
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : now,
    updatedAt: now,
    nodes: sanitizeNodes(p.nodes),
    edges: sanitizeEdges(p.edges),
    layoutDirection: p.layoutDirection === 'TB' ? 'TB' : 'LR',
  });
}

/** Append " (2)", " (3)", … until the name is not taken. */
export function uniqueName(name: string, taken: string[]): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} (${i})`;
    if (!used.has(candidate)) return candidate;
  }
}

export function serializeProjectFile(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function projectFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'project';
  return `${safe}.rmm.json`;
}

/** Nodes that were never placed (all at the origin) need an automatic layout. */
export function needsLayout(nodes: PaperNode[]): boolean {
  return nodes.length > 0 && nodes.every((n) => n.position.x === 0 && n.position.y === 0);
}
