import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Panel,
  ViewportPortal,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import { isPaperNode, type MapNode, type PaperEdge, type LayoutDirection, type ViewRequest } from '../../types';
import type { UndoAction } from '../../store/undo';
import { PaperNode as PaperNodeComponent } from '../PaperNode/PaperNode';
import { ClusterNode } from '../MapNodes/ClusterNode';
import { QueryRootNode } from '../MapNodes/QueryRootNode';
import { NoteNode } from '../MapNodes/NoteNode';
import { NOTE_STYLE } from '../MapNodes/noteColors';
import { Toolbar } from '../Toolbar/Toolbar';
import { useAutoLayout } from '../../hooks/useAutoLayout';
import { useSettings } from '../../hooks/settingsContext';
import { useT } from '../../hooks/useT';
import { getYearColor, generateId, RELATIONSHIP_OPTIONS } from '../../utils/helpers';
import { LayoutDirectionContext } from './layoutDirectionContext';
import { MapViewContext, type ColorMode, type MapView } from './mapViewContext';
import { MapActionsContext, type MapActions } from './mapActionsContext';
import { clusterGroups } from '../../store/groups';
import { paperRoles } from '../../store/keyPapers';
import { timelineLayout, type TimelineResult } from '../../utils/timelineLayout';
import { apiPost } from '../../api/client';
import type { ClusterNamesResponse } from '../../../shared/types';
import { ViewMenu } from '../Toolbar/ViewMenu';
import { EMPTY_FILTERS, filterPapers } from '../../store/library';
import { isCitationEdge } from '../../store/mindMapReducer';
import styles from './MindMap.module.css';

const nodeTypes = { paper: PaperNodeComponent, query: QueryRootNode, cluster: ClusterNode, note: NoteNode };

interface MindMapProps {
  nodes: MapNode[];
  edges: PaperEdge[];
  layoutDirection: LayoutDirection;
  viewRequest: ViewRequest;
  dispatch: React.Dispatch<UndoAction>;
  onAddPaper: () => void;
  onToggleSearch: () => void;
  searchOpen: boolean;
  /** New papers found in saved searches (shown on the Search button). */
  searchBadge: number;
  onToggleLibrary: () => void;
  libraryOpen: boolean;
  onToggleWrite: () => void;
  writeOpen: boolean;
  onToggleCompare: () => void;
  compareOpen: boolean;
  onToggleScreen: () => void;
  screenOpen: boolean;
  onToggleAnalyze: () => void;
  analyzeOpen: boolean;
  /** Text filter that highlights matching papers (owned by the app so other panels can set it). */
  filter: string;
  onFilter: (text: string) => void;
}

export function MindMap({
  nodes,
  edges,
  layoutDirection,
  viewRequest,
  dispatch,
  onAddPaper,
  onToggleSearch,
  searchOpen,
  searchBadge,
  onToggleLibrary,
  libraryOpen,
  onToggleWrite,
  writeOpen,
  onToggleCompare,
  compareOpen,
  onToggleScreen,
  screenOpen,
  onToggleAnalyze,
  analyzeOpen,
  filter,
  onFilter,
}: MindMapProps) {
  const { fitView, screenToFlowPosition } = useReactFlow();
  const { applyLayout } = useAutoLayout();
  const { settings } = useSettings();
  const t = useT();
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [selectedRelationship, setSelectedRelationship] = useState(RELATIONSHIP_OPTIONS[0]);
  const [showCitations, setShowCitations] = useState(true);
  const [colorMode, setColorMode] = useState<ColorMode>('year');
  const [sizeByCitations, setSizeByCitations] = useState(false);
  const [timeline, setTimeline] = useState<TimelineResult['columns'] | null>(null);

  const papers = useMemo(() => nodes.filter(isPaperNode).map((n) => n.data.paper), [nodes]);
  const highlight = useMemo(
    () => (filter.trim() ? new Set(filterPapers(papers, { ...EMPTY_FILTERS, text: filter }).map((p) => p.id)) : null),
    [papers, filter],
  );
  const view: MapView = useMemo(
    () => ({
      colorMode,
      sizeByCitations,
      highlight,
      maxCitations: Math.max(0, ...papers.map((p) => p.citationCount ?? 0)),
      roles: paperRoles(papers),
    }),
    [colorMode, sizeByCitations, highlight, papers],
  );

  const actions: MapActions = useMemo(
    () => ({
      renameCluster: (id, label) => dispatch({ type: 'RENAME_CLUSTERS', payload: { [id]: label } }),
      updateNote: (id, patch) => dispatch({ type: 'UPDATE_NOTE', payload: { id, patch } }),
      removeNote: (id, discard) => dispatch(discard ? { type: 'DISCARD_NOTE', payload: id } : { type: 'DELETE_PAPERS', payload: [id] }),
    }),
    [dispatch],
  );
  const clusterCount = useMemo(() => nodes.filter((n) => n.type === 'cluster').length, [nodes]);

  const nameClusters = useCallback(async () => {
    const titleOf = new Map(papers.map((p) => [p.id, p.title]));
    const clusters = nodes
      .filter((n) => n.type === 'cluster')
      .map((n) => ({
        id: n.id,
        label: String(n.data.label),
        titles: (clusterGroups([n], edges)[0]?.paperIds ?? []).map((id) => titleOf.get(id) ?? '').filter(Boolean).slice(0, 15),
      }))
      .filter((c) => c.titles.length > 0 && !/^(other|papers)$/i.test(c.label))
      .slice(0, 20);
    if (clusters.length === 0) return t('view.noClusters');
    try {
      const res = await apiPost<ClusterNamesResponse>('/api/llm/cluster-names', { clusters, lang: settings.aiLanguage, useLlm: settings.useLlm });
      dispatch({ type: 'RENAME_CLUSTERS', payload: res.names });
      return t('view.renamed', { n: Object.keys(res.names).length });
    } catch (err) {
      return (err as Error).message;
    }
  }, [nodes, edges, papers, dispatch, settings, t]);

  const visibleEdges = useMemo(
    () =>
      edges.map((e) => {
        if (!showCitations && isCitationEdge(e)) return { ...e, hidden: true };
        // Fade edges that do not touch a highlighted paper.
        if (highlight && !highlight.has(e.source) && !highlight.has(e.target)) {
          return { ...e, style: { ...e.style, opacity: 0.12 } };
        }
        return e;
      }),
    [edges, showCitations, highlight],
  );

  // Run the layout / fit the view whenever the store asks for it (initial
  // load, project switch, imported results). Both wait until React Flow has
  // measured every node: layout needs real sizes, and fitView ignores
  // unmeasured nodes (it would zoom onto the few that are).
  const allMeasured = nodes.every((n) => n.measured?.width);
  const handledSeq = useRef(-1);
  // Set when a layout was dispatched; the view is fitted once those positions render.
  const fitAfterLayout = useRef(false);
  useEffect(() => {
    if (!fitAfterLayout.current || !allMeasured) return;
    fitAfterLayout.current = false;
    window.requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
  }, [nodes, allMeasured, fitView]);
  useEffect(() => {
    if (handledSeq.current === viewRequest.seq || !allMeasured) return;
    handledSeq.current = viewRequest.seq;
    if (viewRequest.kind === 'layout' && nodes.length > 0) {
      const result = applyLayout(nodes, edges, layoutDirection);
      fitAfterLayout.current = true;
      dispatch({ type: 'APPLY_LAYOUT', payload: result, record: false });
    } else {
      fitAfterLayout.current = true;
    }
  }, [viewRequest, allMeasured]); // eslint-disable-line react-hooks/exhaustive-deps

  // Removals go through the reducer so that references, derived edges and
  // the selection stay consistent; all other changes are applied directly.
  const onNodesChange = useCallback(
    (changes: NodeChange<MapNode>[]) => {
      const removedIds = changes.filter((c) => c.type === 'remove').map((c) => c.id);
      const rest = changes.filter((c) => c.type !== 'remove');
      if (rest.length > 0) {
        dispatch({ type: 'SET_NODES', payload: applyNodeChanges(rest, nodes) });
      }
      if (removedIds.length > 0) {
        dispatch({ type: 'DELETE_PAPERS', payload: removedIds });
      }
    },
    [nodes, dispatch],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<PaperEdge>[]) => {
      const removedIds = changes.filter((c) => c.type === 'remove').map((c) => c.id);
      const rest = changes.filter((c) => c.type !== 'remove');
      if (rest.length > 0) {
        dispatch({ type: 'SET_EDGES', payload: applyEdgeChanges(rest, edges) });
      }
      if (removedIds.length > 0) {
        dispatch({ type: 'REMOVE_CONNECTIONS', payload: removedIds });
      }
    },
    [edges, dispatch],
  );

  const onConnect = useCallback((connection: Connection) => {
    setPendingConnection(connection);
    setSelectedRelationship(RELATIONSHIP_OPTIONS[0]);
  }, []);

  const confirmConnection = useCallback(() => {
    if (!pendingConnection) return;
    dispatch({
      type: 'ADD_CONNECTION',
      payload: {
        id: `e-${generateId()}`,
        source: pendingConnection.source!,
        target: pendingConnection.target!,
        relationship: selectedRelationship,
      },
    });
    setPendingConnection(null);
  }, [pendingConnection, selectedRelationship, dispatch]);

  const cancelConnection = useCallback(() => {
    setPendingConnection(null);
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: MapNode) => {
      dispatch({ type: 'SELECT_NODE', payload: node.id });
    },
    [dispatch],
  );

  const addNoteAt = useCallback(
    (clientX: number, clientY: number) => {
      const p = screenToFlowPosition({ x: clientX, y: clientY });
      dispatch({ type: 'ADD_NOTE', payload: { id: `note-${generateId()}`, position: { x: p.x - 110, y: p.y - 30 } } });
    },
    [dispatch, screenToFlowPosition],
  );

  // A double-click on the empty canvas places a note there (instead of zooming in).
  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.detail === 2) addNoteAt(e.clientX, e.clientY);
      else dispatch({ type: 'SELECT_NODE', payload: null });
    },
    [dispatch, addNoteAt],
  );

  const handleAddNote = useCallback(() => {
    const pane = document.querySelector('.react-flow')?.getBoundingClientRect();
    addNoteAt(pane ? pane.left + pane.width / 2 : window.innerWidth / 2, pane ? pane.top + pane.height / 2 : window.innerHeight / 2);
  }, [addNoteAt]);

  const handleToggleTimeline = useCallback(() => {
    if (timeline) {
      setTimeline(null);
      dispatch({ type: 'REQUEST_VIEW', payload: 'layout' });
      return;
    }
    const result = timelineLayout(nodes);
    setTimeline(result.columns);
    fitAfterLayout.current = true;
    dispatch({ type: 'APPLY_LAYOUT', payload: { nodes: result.nodes, edges } });
  }, [timeline, nodes, edges, dispatch]);

  // Top of the timeline, for placing the year axis above the cards.
  const timelineTop = useMemo(
    () => (timeline ? Math.min(0, ...nodes.filter(isPaperNode).map((n) => n.position.y)) - 60 : 0),
    [timeline, nodes],
  );

  const handleAutoLayout = useCallback(() => {
    setTimeline(null);
    const result = applyLayout(nodes, edges, layoutDirection);
    fitAfterLayout.current = true;
    dispatch({ type: 'APPLY_LAYOUT', payload: result });
  }, [nodes, edges, layoutDirection, applyLayout, dispatch]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 });
  }, [fitView]);

  const handleToggleDirection = useCallback(() => {
    const newDir = layoutDirection === 'LR' ? 'TB' : 'LR';
    dispatch({ type: 'SET_LAYOUT_DIRECTION', payload: newDir });
    const result = applyLayout(nodes, edges, newDir);
    fitAfterLayout.current = true;
    dispatch({ type: 'APPLY_LAYOUT', payload: result });
  }, [layoutDirection, nodes, edges, applyLayout, dispatch]);

  const minimapNodeColor = useCallback((node: MapNode) => {
    if (node.type === 'query') return '#1a1a2e';
    if (node.type === 'cluster') return node.data.color;
    if (node.type === 'note') return NOTE_STYLE[node.data.color]?.border ?? '#eab308';
    return getYearColor(node.data.paper.year);
  }, []);

  return (
    <MapActionsContext.Provider value={actions}>
      <MapViewContext.Provider value={view}>
        <LayoutDirectionContext.Provider value={layoutDirection}>
          <div className={styles.wrapper}>
            <ReactFlow
              nodes={nodes}
              edges={visibleEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
          // One undo step per drag, taken before the first move.
          onNodeDragStart={() => dispatch({ type: 'CHECKPOINT' })}
              onPaneClick={onPaneClick}
              zoomOnDoubleClick={false}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              minZoom={0.1}
              maxZoom={2}
              defaultEdgeOptions={{ type: 'smoothstep' }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
          {timeline && (
            <ViewportPortal>
              {timeline.map((c) => (
                <div
                  key={c.year}
                  className={styles.yearLabel}
                  style={{ transform: `translate(${c.x}px, ${timelineTop}px)` }}
                >
                  {c.year || 'n.d.'}
                </div>
              ))}
            </ViewportPortal>
          )}
              <Controls position="bottom-right" showInteractive={false} />
              <MiniMap
                position="bottom-left"
                pannable
                zoomable
                nodeColor={minimapNodeColor}
                maskColor="rgba(250, 251, 252, 0.7)"
              />
              <Panel position="top-right">
                <Toolbar
                  layoutDirection={layoutDirection}
                  onAutoLayout={handleAutoLayout}
                  onAddPaper={onAddPaper}
                  onToggleSearch={onToggleSearch}
                  searchOpen={searchOpen}
                  searchBadge={searchBadge}
                  onToggleLibrary={onToggleLibrary}
                  libraryOpen={libraryOpen}
                onToggleWrite={onToggleWrite}
                writeOpen={writeOpen}
              onToggleCompare={onToggleCompare}
              compareOpen={compareOpen}
              onToggleScreen={onToggleScreen}
              screenOpen={screenOpen}
              onToggleAnalyze={onToggleAnalyze}
              analyzeOpen={analyzeOpen}
              onAddNote={handleAddNote}
                  onFitView={handleFitView}
                  onToggleDirection={handleToggleDirection}
                  showCitations={showCitations}
                  onToggleCitations={() => setShowCitations((v) => !v)}
              timelineOn={timeline !== null}
              onToggleTimeline={handleToggleTimeline}
                  viewMenu={
                    <ViewMenu
                      colorMode={colorMode}
                      onColorMode={setColorMode}
                      sizeByCitations={sizeByCitations}
                      onSizeByCitations={(on) => {
                      setSizeByCitations(on);
                      // Re-run the layout once React Flow has measured the resized cards.
                      window.setTimeout(() => dispatch({ type: 'REQUEST_VIEW', payload: 'layout' }), 120);
                    }}
                      filter={filter}
                      onFilter={onFilter}
                      matchCount={highlight ? highlight.size : null}
                    clusterCount={clusterCount}
                    onNameClusters={nameClusters}
                    />
                  }
                />
              </Panel>
            </ReactFlow>

            {pendingConnection && (
              <>
                <div className={styles.overlay} onClick={cancelConnection} />
                <div className={styles.connectionDialog}>
                  <h3>{t('map.addConnection')}</h3>
                  <select
                    value={selectedRelationship}
                    onChange={(e) => setSelectedRelationship(e.target.value)}
                  >
                    {RELATIONSHIP_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <div className={styles.dialogActions}>
                    <button className={styles.dialogBtn} onClick={cancelConnection}>
                      {t('map.cancel')}
                    </button>
                    <button
                      className={`${styles.dialogBtn} ${styles.dialogBtnPrimary}`}
                      onClick={confirmConnection}
                    >
                      {t('map.add')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </LayoutDirectionContext.Provider>
      </MapViewContext.Provider>
    </MapActionsContext.Provider>
  );
}
