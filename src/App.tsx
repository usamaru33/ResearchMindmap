import { useCallback, useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { MindMap } from './components/MindMap/MindMap';
import { Sidebar } from './components/Sidebar/Sidebar';
import { DetailPanel } from './components/DetailPanel/DetailPanel';
import { Library } from './components/Library/Library';
import { ProjectMenu } from './components/ProjectMenu/ProjectMenu';
import { SearchPanel, type BuildMode, type BuildTarget } from './components/SearchPanel/SearchPanel';
import { apiPost } from './api/client';
import { buildGraphElements } from './store/graphImport';
import { tagCounts } from './utils/reading';
import { useMindMapStore } from './hooks/useMindMapStore';
import { loadInitialProject, useProjects } from './hooks/useProjects';
import { useSearch, useVagueSearch } from './hooks/useSearch';
import { createProject } from './store/projects';
import { sampleNodes } from './data/sampleData';
import type { Paper } from './types';
import type { GraphBuildResponse } from '../shared/types';
import styles from './App.module.css';

export default function App() {
  const [initialProject] = useState(() =>
    loadInitialProject(() => createProject('Sample: Transformers & friends', sampleNodes)),
  );
  const { state, dispatch, getSelectedPaper, getAllPapers, getCitedBy, getReferences } =
    useMindMapStore(initialProject);
  const projects = useProjects(initialProject, state, dispatch);
  const search = useSearch();
  const vague = useVagueSearch();
  const mapIds = useMemo(() => new Set(state.nodes.map((n) => n.id)), [state.nodes]);
  const allPapers = getAllPapers();
  const knownTags = useMemo(() => tagCounts(allPapers.map((p) => p.tags)).map(([t]) => t), [allPapers]);
  const { screenToFlowPosition, getNode, setCenter } = useReactFlow();

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
          />
        }
        searchPanel={
          <SearchPanel
            search={search.state}
            onSearch={search.run}
            vague={vague.state}
            onVague={vague.run}
            mapIds={mapIds}
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
    </div>
  );
}
