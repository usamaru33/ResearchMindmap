import { Suspense, type ReactNode } from 'react';
import type { Paper, SidebarMode } from '../../types';
import { PaperForm } from '../PaperForm/PaperForm';
import { IdentifierImport } from './IdentifierImport';
import { useT } from '../../hooks/useT';
import type { MessageKey } from '../../i18n';
import { navLocation, type PanelTabs } from '../../store/navigation';
import { Tabs } from '../common/Tabs';
import { tabPanel } from '../common/tabPanel';
import styles from './Sidebar.module.css';

interface SidebarProps {
  mode: SidebarMode;
  selectedPaper: Paper | null;
  allPapers: Paper[];
  onSubmit: (paper: Paper) => void;
  onClose: () => void;
  /** Kept mounted while hidden so the search form and results survive closing the panel. */
  searchPanel: ReactNode;
  /** Query search of the add panel; also kept mounted. */
  addSearchPanel: ReactNode;
  libraryPanel: ReactNode;
  writingPanel: ReactNode;
  comparePanel: ReactNode;
  screeningPanel: ReactNode;
  analysisPanel: ReactNode;
  mapIds: Set<string>;
  onAddPapers: (papers: Paper[]) => void;
  addTab: PanelTabs['add'];
  onAddTab: (tab: PanelTabs['add']) => void;
}

const ADD_TABS: Array<[PanelTabs['add'], MessageKey]> = [
  ['query', 'sidebar.fromQuery'],
  ['identifiers', 'sidebar.fromIds'],
  ['references', 'sidebar.fromReferences'],
  ['manual', 'sidebar.manual'],
];

const TITLES: Record<Exclude<SidebarMode, 'closed'>, MessageKey> = {
  search: 'sidebar.search',
  library: 'sidebar.library',
  write: 'sidebar.write',
  compare: 'sidebar.compare',
  screen: 'sidebar.screen',
  analyze: 'sidebar.analyze',
  add: 'sidebar.add',
  edit: 'sidebar.edit',
};

export function Sidebar({ mode, selectedPaper, allPapers, onSubmit, onClose, searchPanel, addSearchPanel, libraryPanel, writingPanel, comparePanel, screeningPanel, analysisPanel, mapIds, onAddPapers, addTab, onAddTab: setAddTab }: SidebarProps) {
  const t = useT();
  const isOpen = mode !== 'closed';
  const isForm = mode === 'add' || mode === 'edit';
  const group = navLocation(mode)?.group;

  return (
    <div
      className={`${styles.sidebar} ${mode === 'compare' ? styles.sidebarXWide : mode === 'search' || (mode === 'add' && addTab === 'query') || mode === 'library' || mode === 'write' || mode === 'screen' || mode === 'analyze' ? styles.sidebarWide : ''} ${!isOpen ? styles.sidebarClosed : ''}`}
      aria-hidden={!isOpen}
    >
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>
          {group && <span className={styles.headerGroup}>{t(group.label)}</span>}
          {mode === 'closed' ? '' : t(TITLES[mode])}
        </h2>
        <button className={styles.closeBtn} onClick={onClose} aria-label={t('sidebar.close')}>
          &times;
        </button>
      </div>
      <div className={styles.body}>
        <div hidden={mode !== 'search'}>{searchPanel}</div>
        <Suspense fallback={<div className={styles.loading}>{t('sidebar.loading')}</div>}>
          {mode === 'library' && libraryPanel}
          {mode === 'write' && writingPanel}
          {mode === 'compare' && comparePanel}
          {mode === 'screen' && screeningPanel}
          {mode === 'analyze' && analysisPanel}
        </Suspense>
        {mode === 'add' && (
          <Tabs
            id="add"
            label={t('nav.add')}
            tabs={ADD_TABS.map(([id, label]) => ({ id, label: t(label) }))}
            value={addTab}
            onChange={setAddTab}
            className={styles.addTabs}
          />
        )}
        <div {...tabPanel('add', 'query', mode === 'add' ? addTab : '')}>{addSearchPanel}</div>
        {mode === 'add' && (addTab === 'identifiers' || addTab === 'references') && (
          <div {...tabPanel('add', addTab, addTab)}>
            <IdentifierImport key={addTab} mode={addTab} mapIds={mapIds} onAdd={onAddPapers} />
          </div>
        )}
        {isForm && (mode === 'edit' || addTab === 'manual') && (
          <PaperForm
            key={mode === 'edit' ? selectedPaper?.id : 'new'}
            paper={mode === 'edit' ? selectedPaper : null}
            allPapers={allPapers}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  );
}
