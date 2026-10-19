import { describe, expect, it } from 'vitest';
import type { PaperNode } from '../types';
import {
  ProjectImportError,
  ProjectStore,
  createProject,
  needsLayout,
  parseProjectFile,
  projectFileName,
  serializeProjectFile,
  uniqueName,
  type KeyValueStorage,
} from './projects';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function node(id: string, x = 0, y = 0): PaperNode {
  return {
    id,
    type: 'paper',
    position: { x, y },
    data: {
      paper: {
        id,
        title: id,
        authors: [],
        belongs: '',
        year: 2020,
        venue: '',
        abstract: '',
        challenges: '',
        futureWork: '',
        references: [],
      },
      isExpanded: false,
    },
  };
}

describe('ProjectStore', () => {
  it('saves, lists (newest first), loads and removes projects', () => {
    const store = new ProjectStore(memoryStorage());
    const a = createProject('A', [node('x')], [], 'LR', '2026-01-01T00:00:00Z');
    const b = createProject('B', [], [], 'TB', '2026-02-01T00:00:00Z');
    expect(store.save(a)).toBe(true);
    expect(store.save(b)).toBe(true);

    expect(store.list().map((p) => p.name)).toEqual(['B', 'A']);
    expect(store.list().find((p) => p.name === 'A')?.paperCount).toBe(1);
    expect(store.load(a.id)?.nodes[0].id).toBe('x');

    store.setActiveId(a.id);
    store.remove(a.id);
    expect(store.load(a.id)).toBeNull();
    expect(store.list().map((p) => p.name)).toEqual(['B']);
    expect(store.getActiveId()).toBeNull();
  });

  it('strips React Flow runtime fields before saving', () => {
    const n = { ...node('x'), selected: true, measured: { width: 1, height: 2 }, dragging: true };
    const p = createProject('A', [n]);
    expect(p.nodes[0]).not.toHaveProperty('measured');
    expect(p.nodes[0]).not.toHaveProperty('selected');
  });

  it('reports failure instead of throwing when storage is full', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    expect(new ProjectStore(storage).save(createProject('A'))).toBe(false);
  });

  it('ignores corrupted entries', () => {
    const storage = memoryStorage();
    storage.setItem('rmm:v1:index', '{not json');
    expect(new ProjectStore(storage).list()).toEqual([]);
  });
});

describe('project files', () => {
  it('round-trips through export and import with a fresh id', () => {
    const original = createProject('My map', [node('x', 10, 20)], [], 'TB');
    const imported = parseProjectFile(serializeProjectFile(original));
    expect(imported.id).not.toBe(original.id);
    expect(imported.name).toBe('My map');
    expect(imported.layoutDirection).toBe('TB');
    expect(imported.nodes[0].position).toEqual({ x: 10, y: 20 });
  });

  it('turns edges saved as right-angled steps into curves', () => {
    const file = JSON.stringify({
      nodes: [],
      edges: [
        { id: 'cite-a-b', source: 'a', target: 'b', type: 'smoothstep' },
        { id: 'grp-c-a', source: 'c', target: 'a', type: 'default' },
      ],
    });
    expect(parseProjectFile(file).edges.map((e) => e.type)).toEqual(['default', 'default']);
  });

  it('rejects files that are not projects', () => {
    expect(() => parseProjectFile('nope')).toThrow(ProjectImportError);
    expect(() => parseProjectFile('{"foo":1}')).toThrow(ProjectImportError);
    expect(() => parseProjectFile('{"nodes":[{}],"edges":[]}')).toThrow(ProjectImportError);
  });

  it('builds a safe file name', () => {
    expect(projectFileName('a/b: c?')).toBe('a_b_ c_.rmm.json');
    expect(projectFileName('  ')).toBe('project.rmm.json');
  });
});

describe('needsLayout', () => {
  it('is true only when every node sits at the origin', () => {
    expect(needsLayout([])).toBe(false);
    expect(needsLayout([node('a'), node('b')])).toBe(true);
    expect(needsLayout([node('a'), node('b', 5, 0)])).toBe(false);
  });
});

describe('uniqueName', () => {
  it('appends a counter when the name is taken', () => {
    expect(uniqueName('A', [])).toBe('A');
    expect(uniqueName('A', ['A'])).toBe('A (2)');
    expect(uniqueName('A', ['A', 'A (2)'])).toBe('A (3)');
  });
});
