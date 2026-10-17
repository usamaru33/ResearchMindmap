import { useCallback, useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { MindMap } from './components/MindMap/MindMap';
import { Sidebar } from './components/Sidebar/Sidebar';
import { DetailPanel } from './components/DetailPanel/DetailPanel';
import { ProjectMenu } from './components/ProjectMenu/ProjectMenu';
import { SearchPanel } from './components/SearchPanel/SearchPanel';
import { useMindMapStore } from './hooks/useMindMapStore';
import { loadInitialProject, useProjects } from './hooks/useProjects';
import { useSearch } from './hooks/useSearch';
import { createProject } from './store/projects';
import { sampleNodes } from './data/sampleData';
import type { Paper } from './types';
import styles from './App.module.css';

export default function App() {
  const [initialProject] = useState(() =>
    loadInitialProject(() => createProject('Sample: Transformers & friends', sampleNodes)),
  );
  const { state, dispatch, getSelectedPaper, getAllPapers, getCitedBy, getReferences } =
    useMindMapStore(initialProject);
  const projects = useProjects(initialProject, state, dispatch);
  const search = useSearch();
  const mapIds = useMemo(() => new Set(state.nodes.map((n) => n.id)), [state.nodes]);
  const { screenToFlowPosition } = useReactFlow();

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
        allPapers={getAllPapers()}
        onSubmit={handleSubmitPaper}
        onClose={handleCloseSidebar}
        searchPanel={<SearchPanel search={search.state} onSearch={search.run} mapIds={mapIds} />}
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
      />
    </div>
  );
}
