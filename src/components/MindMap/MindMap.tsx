import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Panel,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import type { MapNode, PaperEdge, MindMapAction, LayoutDirection, ViewRequest } from '../../types';
import { PaperNode as PaperNodeComponent } from '../PaperNode/PaperNode';
import { ClusterNode } from '../MapNodes/ClusterNode';
import { QueryRootNode } from '../MapNodes/QueryRootNode';
import { Toolbar } from '../Toolbar/Toolbar';
import { useAutoLayout } from '../../hooks/useAutoLayout';
import { getYearColor, generateId, RELATIONSHIP_OPTIONS } from '../../utils/helpers';
import { LayoutDirectionContext } from './layoutDirectionContext';
import { isCitationEdge } from '../../store/mindMapReducer';
import styles from './MindMap.module.css';

const nodeTypes = { paper: PaperNodeComponent, query: QueryRootNode, cluster: ClusterNode };

interface MindMapProps {
  nodes: MapNode[];
  edges: PaperEdge[];
  layoutDirection: LayoutDirection;
  viewRequest: ViewRequest;
  dispatch: React.Dispatch<MindMapAction>;
  onAddPaper: () => void;
  onToggleSearch: () => void;
  searchOpen: boolean;
  onToggleLibrary: () => void;
  libraryOpen: boolean;
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
  onToggleLibrary,
  libraryOpen,
}: MindMapProps) {
  const { fitView } = useReactFlow();
  const { applyLayout } = useAutoLayout();
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [selectedRelationship, setSelectedRelationship] = useState(RELATIONSHIP_OPTIONS[0]);
  const [showCitations, setShowCitations] = useState(true);
  const visibleEdges = useMemo(
    () => (showCitations ? edges : edges.map((e) => (isCitationEdge(e) ? { ...e, hidden: true } : e))),
    [edges, showCitations],
  );

  // Run the layout / fit the view whenever the store asks for it (initial
  // load, project switch, imported results). Node measurements are only
  // available after the first paint, hence the animation frame.
  const handledSeq = useRef(-1);
  useEffect(() => {
    if (handledSeq.current === viewRequest.seq) return;
    handledSeq.current = viewRequest.seq;
    if (viewRequest.kind === 'layout' && nodes.length > 0) {
      const result = applyLayout(nodes, edges, layoutDirection);
      dispatch({ type: 'APPLY_LAYOUT', payload: result });
    } else {
      window.requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
    }
  }, [viewRequest]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const onPaneClick = useCallback(() => {
    dispatch({ type: 'SELECT_NODE', payload: null });
  }, [dispatch]);

  const handleAutoLayout = useCallback(() => {
    const result = applyLayout(nodes, edges, layoutDirection);
    dispatch({ type: 'APPLY_LAYOUT', payload: result });
  }, [nodes, edges, layoutDirection, applyLayout, dispatch]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 });
  }, [fitView]);

  const handleToggleDirection = useCallback(() => {
    const newDir = layoutDirection === 'LR' ? 'TB' : 'LR';
    dispatch({ type: 'SET_LAYOUT_DIRECTION', payload: newDir });
    const result = applyLayout(nodes, edges, newDir);
    dispatch({ type: 'APPLY_LAYOUT', payload: result });
  }, [layoutDirection, nodes, edges, applyLayout, dispatch]);

  const minimapNodeColor = useCallback((node: MapNode) => {
    if (node.type === 'query') return '#1a1a2e';
    if (node.type === 'cluster') return node.data.color;
    return getYearColor(node.data.paper.year);
  }, []);

  return (
    <LayoutDirectionContext.Provider value={layoutDirection}>
      <div className={styles.wrapper}>
        <ReactFlow
          nodes={nodes}
          edges={visibleEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
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
              onToggleLibrary={onToggleLibrary}
              libraryOpen={libraryOpen}
              onFitView={handleFitView}
              onToggleDirection={handleToggleDirection}
              showCitations={showCitations}
              onToggleCitations={() => setShowCitations((v) => !v)}
            />
          </Panel>
        </ReactFlow>

        {pendingConnection && (
          <>
            <div className={styles.overlay} onClick={cancelConnection} />
            <div className={styles.connectionDialog}>
              <h3>Add Connection</h3>
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
                  Cancel
                </button>
                <button
                  className={`${styles.dialogBtn} ${styles.dialogBtnPrimary}`}
                  onClick={confirmConnection}
                >
                  Add
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </LayoutDirectionContext.Provider>
  );
}
