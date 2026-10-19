import type { SidebarMode } from '../../types';
import { NAV_GROUPS, isTabbed, navLocation, type NavIcon, type NavPanel, type PanelTabs } from '../../store/navigation';
import { useT } from '../../hooks/useT';
import styles from './FeatureNav.module.css';

const ICON_PATHS: Record<NavIcon, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.35-4.35',
  add: 'M12 5v14M5 12h14',
  library: 'M5 4h4v16H5zM10 4h4v16h-4zM15.5 5.2l3.8-1 3.6 15.5-3.8 1z',
  screen: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  compare: 'M4 5h16v14H4zM4 10h16M10 5v14',
  analyze: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  write: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
};

function Icon({ name }: { name: NavIcon }) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

interface FeatureNavProps {
  open: boolean;
  mode: SidebarMode;
  tabs: PanelTabs;
  /** Open a panel (and a tab of it); opening the shown panel again closes it. */
  onOpen: (panel: NavPanel, tab?: string) => void;
  searchBadge: number;
}

/** The left-hand feature menu: category → panel → tab (DESIGN 14.2). */
export function FeatureNav({ open, mode, tabs, onOpen, searchBadge }: FeatureNavProps) {
  const t = useT();
  const current = navLocation(mode)?.item.panel ?? null;
  return (
    <nav id="feature-nav" className={`${styles.nav} ${open ? '' : styles.closed}`} aria-label={t('nav.label')} hidden={!open}>
      {NAV_GROUPS.map((group) => (
        <section key={group.id} className={styles.group} aria-labelledby={`nav-group-${group.id}`}>
          <h2 id={`nav-group-${group.id}`} className={styles.groupTitle}>
            {t(group.label)}
          </h2>
          <ul className={styles.items}>
            {group.items.map((item) => {
              const active = current === item.panel;
              const activeTab = isTabbed(item.panel) ? tabs[item.panel] : null;
              return (
                <li key={item.panel}>
                  <button
                    type="button"
                    className={`${styles.item} ${active ? styles.itemActive : ''}`}
                    aria-current={active && !item.tabs ? 'page' : undefined}
                    aria-expanded={item.tabs ? active : undefined}
                    onClick={() => onOpen(item.panel)}
                  >
                    <Icon name={item.icon} />
                    <span className={styles.itemLabel}>{t(item.label)}</span>
                    {item.panel === 'search' && searchBadge > 0 && (
                      <span className={styles.badge} title={t('nav.alerts', { n: searchBadge })}>
                        {searchBadge}
                      </span>
                    )}
                  </button>
                  {item.tabs && active && (
                    <ul className={styles.tabs}>
                      {item.tabs.map((tab) => (
                        <li key={tab.id}>
                          <button
                            type="button"
                            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                            aria-current={activeTab === tab.id ? 'page' : undefined}
                            onClick={() => onOpen(item.panel, tab.id)}
                          >
                            {t(tab.label)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

/** The ☰ button that shows and hides the menu. */
export function NavToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      className={`${styles.toggle} ${open ? styles.toggleOn : ''}`}
      aria-expanded={open}
      aria-controls="feature-nav"
      aria-label={open ? t('nav.toggleClose') : t('nav.toggleOpen')}
      title={open ? t('nav.toggleClose') : t('nav.toggleOpen')}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
