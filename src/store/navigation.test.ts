import { describe, expect, it } from 'vitest';
import { DEFAULT_TABS, NAV_GROUPS, isTabbed, loadNavOpen, navLocation, saveNavOpen } from './navigation';

describe('feature menu', () => {
  it('lists every panel once, and the tabs of tabbed panels match their defaults', () => {
    const panels = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.panel));
    expect(new Set(panels).size).toBe(panels.length);
    expect(panels.sort()).toEqual(['add', 'analyze', 'compare', 'library', 'screen', 'search', 'write']);
    for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
      if (isTabbed(item.panel)) expect(item.tabs?.map((t) => t.id)).toContain(DEFAULT_TABS[item.panel]);
      else expect(item.tabs).toBeUndefined();
    }
  });

  it('locates the open panel; editing a paper belongs to adding papers', () => {
    expect(navLocation('screen')?.group.id).toBe('organize');
    expect(navLocation('edit')?.item.panel).toBe('add');
    expect(navLocation('closed')).toBeNull();
  });

  it('remembers the open state, defaulting by screen width', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(loadNavOpen(storage, 1400)).toBe(true);
    expect(loadNavOpen(storage, 800)).toBe(false);
    saveNavOpen(storage, false);
    expect(loadNavOpen(storage, 1400)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadNavOpen(broken, 1400)).toBe(true);
  });
});
