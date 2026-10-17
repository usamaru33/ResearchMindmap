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
import { useShortcuts } from './hooks/useShortcuts';
import { SearchPanel, type BuildMode, type BuildTarget } from './components/SearchPanel/SearchPanel';
import { apiPost } from './api/client';
import { buildGraphElements } from './store/graphImport';
import { tagCounts } from './utils/reading';
import { exportPapers, parseBibliography } from './utils/bibliography';
import { exportMapImage } from './utils/exportImage';
import { useMindMapStore } from './hooks/useMindMapStore';
import { loadInitialProject, useProjects } from './hooks/useProjects';
import { useSearch, useVagueSearch } from './hooks/useSearch';
import { createProject } from './store/projects';
import { sampleNodes } from './data/sampleData';
import type { Paper } from './types';
import type { GraphBuildResponse } from '../shared/types';
import styles from './App.module.css';

// Panels opened on demand load in their own chunks.
const Library = lazy(() => import('./components/Library/Library').then((m) => ({ default: m.Library })));
const WritingPanel = lazy(() => import('./components/Writing/WritingPanel').then((m) => ({ default: m.WritingPanel })));
const ComparisonTable = lazy(() =>
  import('./components/Comparison/ComparisonTable').then((m) => ({ default: m.ComparisonTable })),
);
const ScreeningPanel = lazy(() => import('./components/Screening/ScreeningPanel').then((m) => ({ default: m.ScreeningPanel })));

export default function App() {
  const [initialProject] = useState(() =>
    loadInitialProject(() => createProject('Sample: Transformers & friends', sampleNodes)),
  );
  const { state, dispatch, canUndo, canRedo, getSelectedPaper, getAllPapers, getCitedBy, getReferences } =
    useMindMapStore(initialProject);
  const projects = useProjects(initialProject, state, dispatch);
  const search = useSearch();
  const vague = useVagueSearch();
  const mapIds = useMemo(() => new Set(state.nodes.map((n) => n.id)), [state.nodes]);
  const allPapers = getAllPapers();
  const knownTags = useMemo(() => tagCounts(allPapers.map((p) => p.tags)).map(([t]) => t), [allPapers]);
  const { screenToFlowPosition, getNode, getNodes, setCenter, fitView } = useReactFlow();
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selectedPaper = getSelectedPaper();
  // The paper form and the detail panel compete for attention; search can sit next to details.
  const showDetailPanel =
    selectedPaper !== null && state.sidebarMode !== 'add' && state.sidebarMode !== 'edit';

  const handleAddPaper = useCallback(() => {
    dispatch({ type: 'SELECT_NODE', payload: null });
    dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'add' });
  }, [dispatch]);

  const handleToggleSearch = useCallback(() => {
    dispatch({ type: 'SET_SIDEBAR_MODE', payload: state.sidebarMode === 'search' ? 'closed' : 'search' });
  }, [dispatch, state.sidebarMode]);

  useShortcuts({
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
    openSearch: () => {
      dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'search' });
      window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-query-input]')?.focus(), 50);
    },
    fitView: () => fitView({ padding: 0.2, duration: 300 }),
    toggleHelp: () => setHelpOpen((v) => !v),
    closePanels: () => {
      if (helpOpen) setHelpOpen(false);
      else if (settingsOpen) setSettingsOpen(false);
      else if (state.sidebarMode !== 'closed') dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'closed' });
      else dispatch({ type: 'SELECT_NODE', payload: null });
    },
  });

  const recordHistory = useCallback(
    (kind: 'query' | 'vague', text: string, resultCount: number) =>
      dispatch({
        type: 'ADD_HISTORY',
        payload: { id: crypto.randomUUID(), kind, text, at: new Date().toISOString(), resultCount },
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
  const groups = useMemo(() => clusterGroups(state.nodes, state.edges), [state.nodes, state.edges]);
  const openWriting = useCallback(
    (ids: string[]) => {
      setDraftIds(ids);
      dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'write' });
    },
    [dispatch],
  );
  const handleToggleWrite = useCallback(() => {
    if (state.sidebarMode === 'write') dispatch({ type: 'SET_SIDEBAR_MODE', payload: 'closed' });
    else openWriting([]);
  }, [dispatch, state.sidebarMode, openWriting]);

  const handleToggleScreen = useCallback(() => {
    dispatch({ type: 'SET_SIDEBAR_MODE', payload: state.sidebarMode === 'screen' ? 'closed' : 'screen' });
  }, [dispatch, state.sidebarMode]);

  const handleToggleCompare = useCallback(() => {
    dispatch({ type: 'SET_SIDEBAR_MODE', payload: state.sidebarMode === 'compare' ? 'closed' : 'compare' });
  }, [dispatch, state.sidebarMode]);

  const handleToggleLibrary = useCallback(() => {
    dispatch({ type: 'SET_SIDEBAR_MODE', payload: state.sidebarMode === 'library' ? 'closed' : 'library' });
  }, [dispatch, state.sidebarMode]);

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

  return (
    <div className={styles.app}>
      <Sidebar
        mode={state.sidebarMode}
        selectedPaper={selectedPaper}
        allPapers={allPapers}
        onSubmit={handleSubmitPaper}
        onClose={handleCloseSidebar}
        mapIds={mapIds}
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
        writingPanel={
          <WritingPanel
            key={draftIds.join(',')}
            papers={allPapers}
            initialIds={draftIds}
            groups={groups}
            projectName={projects.activeProject.name}
            onFocusPaper={handleFocusPaper}
          />
        }
        searchPanel={
          <SearchPanel
            search={search.state}
            onSearch={async (req) => {
              const res = await search.run(req);
              if (res) recordHistory('query', req.query, res.results.length);
            }}
            vague={vague.state}
            onVague={async (req) => {
              const res = await vague.run(req);
              if (res) recordHistory('vague', req.description, res.results.length);
            }}
            history={state.history}
            onPinHistory={(id) => dispatch({ type: 'PIN_HISTORY', payload: id })}
            onRemoveHistory={(id) => dispatch({ type: 'REMOVE_HISTORY', payload: id })}
            mapIds={mapIds}
            mapPapers={allPapers}
            onBuildMap={handleBuildMap}
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
          onExportImage={(format) => exportMapImage(getNodes(), format, projects.activeProject.name)}
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
          onAddPaper={handleAddPaper}
          onToggleSearch={handleToggleSearch}
          searchOpen={state.sidebarMode === 'search'}
          onToggleLibrary={handleToggleLibrary}
          libraryOpen={state.sidebarMode === 'library'}
          onToggleWrite={handleToggleWrite}
          writeOpen={state.sidebarMode === 'write'}
          onToggleCompare={handleToggleCompare}
          compareOpen={state.sidebarMode === 'compare'}
          onToggleScreen={handleToggleScreen}
          screenOpen={state.sidebarMode === 'screen'}
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
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
