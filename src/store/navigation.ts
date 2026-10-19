import type { MessageKey } from '../i18n';
import type { SidebarMode } from '../types';

/** Panels reachable from the feature menu. */
export type NavPanel = Exclude<SidebarMode, 'closed' | 'edit'>;

/** The tab each tabbed panel shows. App owns these so the menu and the panels agree. */
export interface PanelTabs {
  search: 'query' | 'vague' | 'explore' | 'recommend';
  add: 'query' | 'identifiers' | 'references' | 'manual';
  library: 'list' | 'check' | 'tags';
  analyze: 'map' | 'trends';
  write: 'draft' | 'gaps' | 'cite';
}

export type TabbedPanel = keyof PanelTabs;

export const DEFAULT_TABS: PanelTabs = {
  search: 'query',
  add: 'query',
  library: 'list',
  analyze: 'map',
  write: 'draft',
};

export type NavIcon = 'search' | 'add' | 'library' | 'screen' | 'compare' | 'analyze' | 'write';

export interface NavItem {
  panel: NavPanel;
  label: MessageKey;
  icon: NavIcon;
  tabs?: Array<{ id: string; label: MessageKey }>;
}

export interface NavGroup {
  id: 'collect' | 'organize' | 'analyze' | 'write';
  label: MessageKey;
  items: NavItem[];
}

/** The menu: category → panel → tab (DESIGN 14.2). */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'collect',
    label: 'nav.group.collect',
    items: [
      {
        panel: 'search',
        label: 'nav.search',
        icon: 'search',
        tabs: [
          { id: 'query', label: 'search.tab.query' },
          { id: 'vague', label: 'search.tab.vague' },
          { id: 'explore', label: 'search.tab.explore' },
          { id: 'recommend', label: 'search.tab.recommend' },
        ],
      },
      {
        panel: 'add',
        label: 'nav.add',
        icon: 'add',
        tabs: [
          { id: 'query', label: 'sidebar.fromQuery' },
          { id: 'identifiers', label: 'sidebar.fromIds' },
          { id: 'references', label: 'sidebar.fromReferences' },
          { id: 'manual', label: 'sidebar.manual' },
        ],
      },
    ],
  },
  {
    id: 'organize',
    label: 'nav.group.organize',
    items: [
      {
        panel: 'library',
        label: 'nav.library',
        icon: 'library',
        tabs: [
          { id: 'list', label: 'library.tab.list' },
          { id: 'check', label: 'library.tab.check' },
          { id: 'tags', label: 'library.tab.tags' },
        ],
      },
      { panel: 'screen', label: 'nav.screen', icon: 'screen' },
      { panel: 'compare', label: 'nav.compare', icon: 'compare' },
    ],
  },
  {
    id: 'analyze',
    label: 'nav.group.analyze',
    items: [
      {
        panel: 'analyze',
        label: 'nav.analyze',
        icon: 'analyze',
        tabs: [
          { id: 'map', label: 'analysis.tab.map' },
          { id: 'trends', label: 'analysis.tab.trends' },
        ],
      },
    ],
  },
  {
    id: 'write',
    label: 'nav.group.write',
    items: [
      {
        panel: 'write',
        label: 'nav.write',
        icon: 'write',
        tabs: [
          { id: 'draft', label: 'write.tab.draft' },
          { id: 'gaps', label: 'write.tab.gaps' },
          { id: 'cite', label: 'write.tab.cite' },
        ],
      },
    ],
  },
];

/** The category and item of an open panel ("edit" counts as adding papers), or null when closed. */
export function navLocation(mode: SidebarMode): { group: NavGroup; item: NavItem } | null {
  const panel = mode === 'edit' ? 'add' : mode;
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.panel === panel);
    if (item) return { group, item };
  }
  return null;
}

export function isTabbed(panel: NavPanel): panel is TabbedPanel {
  return panel in DEFAULT_TABS;
}

const NAV_KEY = 'rmm:v1:nav';

/** Whether the menu is open: the saved choice, else open on wide screens. */
export function loadNavOpen(storage: Pick<Storage, 'getItem'> | null, width: number): boolean {
  try {
    const saved = storage?.getItem(NAV_KEY);
    if (saved === '1' || saved === '0') return saved === '1';
  } catch {
    // Blocked storage: fall through to the default.
  }
  return width >= 1100;
}

export function saveNavOpen(storage: Pick<Storage, 'setItem'> | null, open: boolean): void {
  try {
    storage?.setItem(NAV_KEY, open ? '1' : '0');
  } catch {
    // Not remembered; the menu still works.
  }
}
