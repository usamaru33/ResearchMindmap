import { lazy, useCallback, useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { MindMap } from './components/MindMap/MindMap';
import { Sidebar } from './components/Sidebar/Sidebar';
import { DetailPanel } from './components/DetailPanel/DetailPanel';
import { clusterGroups } from './store/groups';
import { ProjectMenu } from './components/ProjectMenu/ProjectMenu';
import { UndoButtons } from './components/ProjectMenu/UndoButtons';
import { ShortcutHelp } from './components/Shortcuts/ShortcutHelp';
import { SettingsDialog } from './components/Settings/SettingsDialog';
import { CommandPalette, type PaletteCommand } from './components/CommandPalette/CommandPalette';
import { bilingual } from './store/palette';
import { useSettings } from './hooks/settingsContext';
import type { MessageKey } from './i18n';
import { useShortcuts } from './hooks/useShortcuts';
import { SearchPanel, type BuildMode, type BuildTarget, type SearchTab } from './components/SearchPanel/SearchPanel';
import { AddQuerySearch } from './components/SearchPanel/AddQuerySearch';
import { LibrarySearch } from './components/SearchPanel/LibrarySearch';
import { FeatureNav, NavToggle } from './components/Nav/FeatureNav';
import { DEFAULT_TABS, isTabbed, loadNavOpen, saveNavOpen, type NavPanel, type PanelTabs } from './store/navigation';
import { apiPost } from './api/client';
import { buildGraphElements } from './store/graphImport';
import { tagCounts } from './utils/reading';
import { exportNotes, exportPapers, parseBibliography } from './utils/bibliography';
import { exportMapImage } from './utils/exportImage';
import { useMindMapStore } from './hooks/useMindMapStore';
import { loadInitialProject, projectStore, useProjects } from './hooks/useProjects';
import { useSearch, useVagueSearch } from './hooks/useSearch';
import { useAlerts } from './hooks/useAlerts';
import { seenKeys } from './store/alerts';
import { createProject } from './store/projects';
import { sampleNodes } from './data/sampleData';
import { isPaperNode, type Paper, type SidebarMode } from './types';
import type { GraphBuildResponse } from '../shared/types';
import styles from './App.module.css';

// Panels opened on demand load in their own chunks.
const Library = lazy(() => import('./components/Library/Library').then((m) => ({ default: m.Library })));
const WritingPanel = lazy(() => import('./components/Writing/WritingPanel').then((m) => ({ default: m.WritingPanel })));
const ComparisonTable = lazy(() =>
  import('./components/Comparison/ComparisonTable').then((m) => ({ default: m.ComparisonTable })),
);
const ScreeningPanel = lazy(() => import('./components/Screening/ScreeningPanel').then((m) => ({ default: m.ScreeningPanel })));
const AnalysisPanel = lazy(() => import('./components/Analysis/AnalysisPanel').then((m) => ({ default: m.AnalysisPanel })));

/** A saved project's papers, for searching across projects. */
function savedPapers(projectId: string): Paper[] {
  return (projectStore.load(projectId)?.nodes ?? []).filter(isPaperNode).map((n) => n.data.paper);
}

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function App() {
  const [initialProject] = useState(() =>
    loadInitialProject(() => createProject('Sample: Transformers & friends', sampleNodes)),
  );
  const { state, dispatch, canUndo, canRedo, getSelectedPaper, getAllPapers, getCitedBy, getReferences } =
    useMindMapStore(initialProject);
  const projects = useProjects(initialProject, state, dispatch);
  const search = useSearch();
  const vague = useVagueSearch();
  const alerts = useAlerts(projects.activeProject.id, state.history, dispatch);
  const alertCount = Object.values(alerts.found).reduce((n, list) => n + list.length, 0);
  const mapIds = useMemo(() => new Set(state.nodes.map((n) => n.id)), [state.nodes]);
  const allPapers = getAllPapers();
  const knownTags = useMemo(() => tagCounts(allPapers.map((p) => p.tags)).map(([t]) => t), [allPapers]);
  const { screenToFlowPosition, getNode, getNodes, getNodesBounds, setCenter, fitView } = useReactFlow();
  const mapBounds = () => {
    const nodes = getNodes();
    return nodes.length ? getNodesBounds(nodes) : null;
  };
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mapFilter, setMapFilter] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { settings, update: updateSettings } = useSettings();
  const [navOpen, setNavOpen] = useState(() => loadNavOpen(localStore(), window.innerWidth));
  const toggleNav = useCallback(() => {
    setNavOpen((open) => {
      saveNavOpen(localStore(), !open);
      return !open;
    });
  }, []);
  const [tabs, setTabs] = useState<PanelTabs>(DEFAULT_TABS);
  const setTab = useCallback(<P extends keyof PanelTabs>(panel: P, tab: PanelTabs[P]) => setTabs((s) => ({ ...s, [panel]: tab })), []);

  const selectedPaper = getSelectedPaper();
  // The paper form and the detail panel compete for attention; search can sit next to details.
  const showDetailPanel =
    selectedPaper !== null && state.sidebarMode !== 'add' && state.sidebarMode !== 'edit';

  const handleAddPaper = useCallback(() => {
    dispatch({ type: 'SELECT_NODE', payload: null });
    dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'add' });
  }, [dispatch]);

  useShortcuts({
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
    openSearch: () => {
      setTab('search', 'query');
      dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'search' });
      window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-query-input]')?.focus(), 50);
    },
    fitView: () => fitView({ padding: 0.2, duration: 300 }),
    toggleHelp: () => setHelpOpen((v) => !v),
    openPalette: () => setPaletteOpen(true),
    closePanels: () => {
      if (paletteOpen) setPaletteOpen(false);
      else if (helpOpen) setHelpOpen(false);
      else if (settingsOpen) setSettingsOpen(false);
      else if (state.sidebarMode !== 'closed') dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'closed' });
      else dispatch({ type: 'SELECT_NODE', payload: null });
    },
  });

  const recordHistory = useCallback(
    (kind: 'query' | 'vague', text: string, results: Paper[]) =>
      dispatch({
        type: 'ADD_HISTORY',
        payload: {
          id: crypto.randomUUID(),
          kind,
          text,
          at: new Date().toISOString(),
          resultCount: results.length,
          seen: seenKeys(results),
        },
      }),
    [dispatch],
  );

  const handleBuildMap = useCallback(
    async (papers: Paper[], target: BuildTarget, query: string, mode: BuildMode) => {
      const graph = await apiPost<GraphBuildResponse>('/api/graph/build', { papers });
      const elements = buildGraphElements(graph, { query, mode });
      if (target === 'new') {
        const name = query.length > 60 ? `${query.slice(0, 57)}…` : query;
        projects.createNew(name, { ...elements, layoutDirection: 'LR' });
      } else {
        dispatch({ type: 'IMPORT_GRAPH', payload: elements });
      }
    },
    [dispatch, projects],
  );

  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [recommendIds, setRecommendIds] = useState<string[]>([]);
  const openSearchTab = useCallback(
    (tab: SearchTab) => {
      setTab('search', tab);
      dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'search' });
    },
    [dispatch, setTab],
  );
  const openRecommend = useCallback(
    (ids: string[]) => {
      setRecommendIds(ids);
      openSearchTab('recommend');
    },
    [openSearchTab],
  );
  const groups = useMemo(() => clusterGroups(state.nodes, state.edges), [state.nodes, state.edges]);
  const openWriting = useCallback(
    (ids: string[]) => {
      setDraftIds(ids);
      dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'write' });
    },
    [dispatch],
  );

  /** From the feature menu: open a panel (at a tab); choosing the open panel itself closes it. */
  const openPanel = useCallback(
    (panel: NavPanel, tab?: string) => {
      const shown = state.sidebarMode === panel;
      if (tab && isTabbed(panel)) setTabs((s) => ({ ...s, [panel]: tab }));
      if (shown) {
        if (!tab) dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'closed' });
        return;
      }
      if (panel === 'add') handleAddPaper();
      else if (panel === 'write') openWriting([]);
      else dispatch({ type: 'SET_SIDEBAR_MODE', payload: panel });
    },
    [dispatch, state.sidebarMode, handleAddPaper, openWriting],
  );

  const handleFocusPaper = useCallback(
    (id: string) => {
      dispatch({ type: 'SELECT_NODE', payload: id });
      const node = getNode(id);
      if (node) {
        const w = node.measured?.width ?? 280;
        const h = node.measured?.height ?? 110;
        setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: 1, duration: 400 });
      }
    },
    [dispatch, getNode, setCenter],
  );

  const handleCloseSidebar = useCallback(() => {
    dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'closed' });
  }, [dispatch]);

  const handleCloseDetail = useCallback(() => {
    dispatch({ type: 'SELECT_NODE', payload: null });
  }, [dispatch]);

  const handleEditFromDetail = useCallback(
    (id: string) => {
      dispatch({ type: 'SELECT_NODE', payload: id });
      dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'edit' });
    },
    [dispatch],
  );

  const handleDeleteFromDetail = useCallback(
    (id: string) => {
      dispatch({ type: 'DELETE_PAPER', payload: id });
    },
    [dispatch],
  );

  const handleSelectPaper = useCallback(
    (id: string) => {
      dispatch({ type: 'SELECT_NODE', payload: id });
    },
    [dispatch],
  );

  const handleSubmitPaper = useCallback(
    (paper: Paper) => {
      if (state.sidebarMode === 'edit') {
        dispatch({ type: 'UPDATE_PAPER', payload: paper });
      } else {
        const centerPosition = screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        dispatch({ type: 'ADD_PAPER', payload: { paper, position: centerPosition } });
      }
      dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'closed' });
    },
    [state.sidebarMode, dispatch, screenToFlowPosition],
  );

  /** Everything the palette can run, named in the UI language (the other language is searchable too). */
  function paletteCommands(): PaletteCommand[] {
    const lang = settings.uiLanguage;
    const panel = (mode: SidebarMode) => () => dispatch({ type: 'SET_SIDEBAR_MODE', payload: mode });
    const name = projects.activeProject.name;
    const defs: Array<[string, MessageKey, () => void, string?]> = [
      ['search', 'cmd.search', () => openSearchTab('query'), '/'],
      ['vague', 'cmd.vague', () => openSearchTab('vague')],
      ['explore', 'cmd.explore', () => openSearchTab('explore')],
      ['mine', 'cmd.mine', () => openSearchTab('mine')],
      ['recommend', 'cmd.recommend', () => openRecommend([])],
      ['library', 'cmd.library', panel('library')],
      ['write', 'cmd.write', () => openWriting([])],
      ['compare', 'cmd.compare', panel('compare')],
      ['screen', 'cmd.screen', panel('screen')],
      ['analyze', 'cmd.analyze', panel('analyze')],
      ['missing', 'cmd.missing', () => openPanel('analyze', 'missing')],
      ['add', 'cmd.addPaper', handleAddPaper],
      ['layout', 'cmd.autoLayout', () => dispatch({ type: 'REQUEST_VIEW', payload: 'layout' })],
      ['fit', 'cmd.fitView', () => fitView({ padding: 0.2, duration: 300 }), 'F'],
      ['direction', 'cmd.direction', () => dispatch({ type: 'SET_LAYOUT_DIRECTION', payload: state.layoutDirection === 'LR' ? 'TB' : 'LR' })],
      ['undo', 'cmd.undo', () => dispatch({ type: 'UNDO' }), 'Ctrl+Z'],
      ['redo', 'cmd.redo', () => dispatch({ type: 'REDO' }), 'Ctrl+Shift+Z'],
      ['bib', 'cmd.exportBib', () => exportPapers(allPapers, 'bib', name)],
      ['ris', 'cmd.exportRis', () => exportPapers(allPapers, 'ris', name)],
      ['csv', 'cmd.exportCsv', () => exportPapers(allPapers, 'csv', name)],
      ['json', 'cmd.exportJson', projects.exportActive],
      ['png', 'cmd.exportPng', () => void exportMapImage(mapBounds(), 'png', name).catch(() => undefined)],
      ['svg', 'cmd.exportSvg', () => void exportMapImage(mapBounds(), 'svg', name).catch(() => undefined)],
      ['notes', 'cmd.notesMd', () => exportNotes(allPapers, 'md', name, state.aspects)],
      ['obsidian', 'cmd.notesObsidian', () => exportNotes(allPapers, 'obsidian', name, state.aspects)],
      ['new', 'cmd.newProject', () => projects.createNew()],
      ['settings', 'cmd.settings', () => setSettingsOpen(true)],
      ['help', 'cmd.help', () => setHelpOpen(true), '?'],
      ['language', 'cmd.language', () => updateSettings({ uiLanguage: lang === 'ja' ? 'en' : 'ja' })],
      ['nav', 'cmd.toggleNav', toggleNav],
    ];
    if (mapFilter) defs.push(['clear-filter', 'cmd.clearFilter', () => setMapFilter('')]);
    const commands: PaletteCommand[] = defs.map(([id, key, run, shortcut]) => ({ id, ...bilingual(key, lang), run, shortcut }));
    for (const p of projects.projects.filter((p) => p.id !== projects.activeProject.id)) {
      commands.push({ id: `project:${p.id}`, ...bilingual('cmd.openProject', lang, { name: p.name }), run: () => projects.switchTo(p.id) });
    }
    return commands;
  }

  return (
    <div className={styles.app}>
      <FeatureNav open={navOpen} mode={state.sidebarMode} tabs={tabs} onOpen={openPanel} searchBadge={alertCount} />
      <Sidebar
        mode={state.sidebarMode}
        selectedPaper={selectedPaper}
        allPapers={allPapers}
        onSubmit={handleSubmitPaper}
        onClose={handleCloseSidebar}
        mapIds={mapIds}
        addTab={tabs.add}
        onAddTab={(tab) => setTab('add', tab)}
        onAddPapers={(papers) => {
          const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
          dispatch({ type: 'ADD_PAPERS', payload: { papers, center } });
          dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'closed' });
        }}
        libraryPanel={
          <Library
            papers={allPapers}
            knownTags={knownTags}
            selectedId={state.selectedNodeId}
            onFocus={handleFocusPaper}
            onUpdate={(ids, patch) => {
              for (const p of allPapers.filter((x) => ids.includes(x.id))) {
                dispatch({ type: 'UPDATE_PAPER_META', payload: { id: p.id, patch: patch(p) } });
              }
            }}
            onDelete={(ids) => dispatch({ type: 'DELETE_PAPERS', payload: ids })}
            onDraft={openWriting}
            onRecommend={openRecommend}
            onMerge={(keepId, mergeIds) => dispatch({ type: 'MERGE_PAPERS', payload: { keepId, mergeIds } })}
            onRenameTag={(from, to) => dispatch({ type: 'RENAME_TAG', payload: { from, to } })}
            view={tabs.library}
            onView={(tab) => setTab('library', tab)}
          />
        }
        comparePanel={
          <ComparisonTable
            papers={allPapers}
            aspects={state.aspects}
            projectName={projects.activeProject.name}
            onSetAspects={(aspects) => dispatch({ type: 'SET_ASPECTS', payload: aspects })}
            onRenameAspect={(from, to) => dispatch({ type: 'RENAME_ASPECT', payload: { from, to } })}
            onSetValues={(aspect, values) => dispatch({ type: 'SET_ASPECT_VALUES', payload: { aspect, values } })}
            onFocusPaper={handleFocusPaper}
          />
        }
        screeningPanel={
          <ScreeningPanel
            papers={allPapers}
            onDecide={(id, screening) => dispatch({ type: 'UPDATE_PAPER_META', payload: { id, patch: { screening } } })}
            onFocusPaper={handleFocusPaper}
          />
        }
        analysisPanel={
          <AnalysisPanel
            papers={allPapers}
            filter={mapFilter}
            onFilter={setMapFilter}
            onFocusPaper={handleFocusPaper}
            latestQuery={state.history.find((h) => h.kind === 'query')?.text ?? ''}
            tab={tabs.analyze}
            onTab={(tab) => setTab('analyze', tab)}
            onAddWithLinks={(papers, links) => {
              const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
              dispatch({ type: 'ADD_PAPERS_WITH_LINKS', payload: { papers, links, center } });
            }}
          />
        }
        writingPanel={
          <WritingPanel
            key={draftIds.join(',')}
            papers={allPapers}
            initialIds={draftIds}
            groups={groups}
            projectName={projects.activeProject.name}
            onFocusPaper={handleFocusPaper}
            tab={tabs.write}
            onTab={(tab) => setTab('write', tab)}
          />
        }
        addSearchPanel={
          <AddQuerySearch mapIds={mapIds} onBuildMap={handleBuildMap} onSearched={(req, res) => recordHistory('query', req.query, res.results)} />
        }
        searchPanel={
          <SearchPanel
            search={search.state}
            onSearch={async (req) => {
              const res = await search.run(req);
              if (res) recordHistory('query', req.query, res.results);
            }}
            vague={vague.state}
            onVague={async (req) => {
              const res = await vague.run(req);
              if (res) recordHistory('vague', req.description, res.results);
            }}
            history={state.history}
            onPinHistory={(id) => dispatch({ type: 'PIN_HISTORY', payload: id })}
            onRemoveHistory={(id) => dispatch({ type: 'REMOVE_HISTORY', payload: id })}
            alerts={alerts}
            mapIds={mapIds}
            mapPapers={allPapers}
            recommendIds={recommendIds}
            tab={tabs.search}
            onTab={(tab) => setTab('search', tab)}
            onBuildMap={handleBuildMap}
            librarySearch={
              <LibrarySearch
                active={state.sidebarMode === 'search' && tabs.search === 'mine'}
                projects={projects.projects}
                activeId={projects.activeProject.id}
                activeName={projects.activeProject.name}
                currentPapers={allPapers}
                loadPapers={savedPapers}
                onFocus={handleFocusPaper}
                onAdd={(papers) => {
                  const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
                  dispatch({ type: 'ADD_PAPERS', payload: { papers, center } });
                }}
                onOpenProject={projects.switchTo}
              />
            }
          />
        }
      />
      <div className={styles.canvas}>
        <ProjectMenu
          activeId={projects.activeProject.id}
          activeName={projects.activeProject.name}
          projects={projects.projects}
          saveError={projects.saveError}
          onSwitch={projects.switchTo}
          onCreate={() => projects.createNew()}
          onRename={projects.rename}
          onDelete={projects.removeActive}
          onExport={projects.exportActive}
          onImport={projects.importFile}
          lead={<NavToggle open={navOpen} onToggle={toggleNav} />}
          extra={
            <UndoButtons
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={() => dispatch({ type: 'UNDO' })}
              onRedo={() => dispatch({ type: 'REDO' })}
              onHelp={() => setHelpOpen(true)}
              onSettings={() => setSettingsOpen(true)}
            />
          }
          onExportBibliography={(format) => exportPapers(allPapers, format, projects.activeProject.name)}
          onExportNotes={(format) => exportNotes(allPapers, format, projects.activeProject.name, state.aspects)}
          onExportImage={(format) => exportMapImage(mapBounds(), format, projects.activeProject.name)}
          onImportBibliography={async (file) => {
            const papers = parseBibliography(await file.text());
            if (papers.length) {
              const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
              dispatch({ type: 'ADD_PAPERS', payload: { papers, center } });
            }
            return papers.length;
          }}
        />
        <MindMap
          nodes={state.nodes}
          edges={state.edges}
          layoutDirection={state.layoutDirection}
          viewRequest={state.viewRequest}
          dispatch={dispatch}
          filter={mapFilter}
          onFilter={setMapFilter}
        />
      </div>
      <DetailPanel
        paper={showDetailPanel ? selectedPaper : null}
        references={selectedPaper ? getReferences(selectedPaper.id) : []}
        citedBy={selectedPaper ? getCitedBy(selectedPaper.id) : []}
        onClose={handleCloseDetail}
        onEdit={handleEditFromDetail}
        onDelete={handleDeleteFromDetail}
        onSelectPaper={handleSelectPaper}
        mapIds={mapIds}
        knownTags={knownTags}
        onUpdateMeta={(id, patch) => dispatch({ type: 'UPDATE_PAPER_META', payload: { id, patch } })}
        onAddLinked={(anchorId, papers, kind) =>
          dispatch({ type: 'ADD_LINKED_PAPERS', payload: { anchorId, papers, kind } })
        }
      />
      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
      {paletteOpen && (
        <CommandPalette
          commands={paletteCommands()}
          papers={allPapers}
          onFocusPaper={handleFocusPaper}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
