/* eslint-disable @typescript-eslint/no-explicit-any -- UI adapters intentionally accept renderer/store payloads. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  applyNodeChanges,
  BackgroundVariant,
  ConnectionLineType,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import {
  Plus, Undo2, Redo2, Maximize, Type, Link2, Pencil,
  Trash2, Check, ChevronDown, ChevronRight, KeyRound, SquareDashed,
  FilePlus2, LayoutList, Settings,
} from 'lucide-react'
import '@xyflow/react/dist/style.css'
import './styles/app.css'
import { DialogScreen } from './components/DialogScreen'
import { EditorTextInput } from './components/EditorTextInput'
import { useDiagramStore } from './domain/store'
import { describeCardinality, parseCardinalityLabel } from './domain/cardinality'
import type { Cardinality, CustomTheme, Diagram, Point, SemanticSelection } from './domain/types'
import { cardinalityLabel } from './domain/types'
import { GRID_SIZE } from './domain/layout'
import { renderDiagram, nodeTypes, edgeTypes } from './renderers/chen-stem'
import { relationshipHandleSide } from './renderers/chen-stem/handles'
import type { DiagramNodeData, NodeActionHandlers } from './renderers/types'

type SheetName = 'entity' | 'attribute' | 'relationship' | 'relationshipEdit' | 'cardinality' | 'menu' | 'library' | null

const BRAND_MARK_URL = "/brand/nightingale-mark.svg"
const REACT_FLOW_LABELS = {
  'controls.ariaLabel': 'Controles del lienzo',
  'controls.zoomIn.ariaLabel': 'Acercar',
  'controls.zoomOut.ariaLabel': 'Alejar',
  'controls.fitView.ariaLabel': 'Ajustar vista',
  'controls.interactive.ariaLabel': 'Alternar interactividad',
  'minimap.ariaLabel': 'Minimapa',
  'handle.ariaLabel': 'Conector',
}

const LIGHT_SURFACE = '#fbf9f4'
const DARK_SURFACE = '#14120f'

function isDarkSurface(color: string) {
  const match = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return false
  const hex = match[1].length === 3
    ? match[1].split('').map((channel) => channel + channel).join('')
    : match[1]
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return (0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]) < 0.5
}

function syncSystemUi(view: Diagram['view']) {
  const surface = view.theme === 'modern'
    ? DARK_SURFACE
    : view.theme === 'custom'
      ? view.customTheme?.background ?? LIGHT_SURFACE
      : LIGHT_SURFACE
  const darkSurface = isDarkSurface(surface)

  document.documentElement.style.setProperty('--system-surface', surface)
  document.documentElement.style.colorScheme = darkSurface ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface)
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', darkSurface ? 'black-translucent' : 'default')
}

function NightingaleMark({ className = '' }: { className?: string }) {
  return <span
    className={`nightingale-mark ${className}`.trim()}
    style={{ '--nightingale-mark-url': `url("${BRAND_MARK_URL}")` } as React.CSSProperties}
    aria-hidden="true"
  />
}

// Attributes are disposable renderer output, not layout objects. Keep them
// out of React Flow's drag interaction while allowing the renderer to own all
// of their geometry. In particular, do not inject guessed width/height here:
// React Flow's measured dimensions belong to the renderer and replacing them
// with stale values is what causes the drag flicker this canvas used to have.
type NodeTarget = Exclude<SemanticSelection, null>

type RelationshipGesture = {
  sourceEntityId: string
  targetEntityId?: string
  dropPosition?: Point
  sourceSide?: 'north' | 'east' | 'south' | 'west'
  touch?: boolean
}

function prepareRendered(
  rendered: ReturnType<typeof renderDiagram>,
  hoveredId?: string,
  actionsFor?: (target: NodeTarget) => NodeActionHandlers,
) {
  return {
    ...rendered,
    nodes: rendered.nodes.map((node) => {
      if (node.data.kind !== 'attribute') return node
      return {
        ...node,
        draggable: false,
        data: { ...node.data, hovered: false },
      }
    }).map((node) => {
      if (node.data.kind === 'attribute') return node
      const target = { type: node.data.kind, id: node.data.semanticId } as NodeTarget
      return {
        ...node,
        data: {
          ...node.data,
          hovered: node.data.semanticId === hoveredId,
          actions: actionsFor?.(target),
        },
      }
    }),
    edges: rendered.edges.map((edge) => {
      const relationshipId = edge.data?.relationshipId
      if (edge.data?.connectorKind !== 'participant' || typeof relationshipId !== 'string') return edge
      const actions = actionsFor?.({ type: 'relationship', id: relationshipId })
      return {
        ...edge,
        data: { ...edge.data, onCardinalityDoubleClick: actions?.editCardinality },
      }
    }),
  }
}

function semanticIdFromNodeId(nodeId: string | null | undefined, kind: 'entity' | 'relationship' = 'entity') {
  const prefix = `${kind}:`
  return nodeId?.startsWith(prefix) ? nodeId.slice(prefix.length) : undefined
}

function clientPoint(event: MouseEvent | TouchEvent): Point | undefined {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0] ?? event.touches[0]
    return touch ? { x: touch.clientX, y: touch.clientY } : undefined
  }
  return { x: event.clientX, y: event.clientY }
}

function CanvasViewport({ diagram, selection, onSelect, onMove, onEdit, actionsFor, onRelationshipGesture }: {
  diagram: any
  selection: SemanticSelection
  onSelect: (s: SemanticSelection) => void
  onMove: (id: string, p: { x: number; y: number }) => void
  onEdit: (target: NodeTarget) => void
  actionsFor: (target: NodeTarget) => NodeActionHandlers
  onRelationshipGesture: (gesture: RelationshipGesture) => void
}) {
  const rf = useReactFlow()
  const layoutMode = diagram.view?.layoutMode ?? 'structured'
  const [hoveredId, setHoveredId] = useState<string>()
  const hoverClearTimer = useRef<number | undefined>(undefined)
  const connectionStart = useRef<RelationshipGesture | undefined>(undefined)
  const connectionCommitted = useRef(false)
  // React Flow is controlled locally during a drag. Re-projecting the whole
  // semantic diagram for every pointer event replaces every node and edge,
  // which makes React Flow lose its drag state and visibly flicker. The
  // semantic model is still updated once, on drag stop, below.
  const initialRendered = useMemo(
    () => prepareRendered(renderDiagram(diagram, selection?.id), hoveredId, actionsFor),
    [actionsFor, diagram, hoveredId, selection],
  )
  const [nodes, setNodes] = useState<Node<DiagramNodeData>[]>(initialRendered.nodes)
  const [edges, setEdges] = useState(initialRendered.edges)

  useEffect(() => () => {
    if (hoverClearTimer.current !== undefined) window.clearTimeout(hoverClearTimer.current)
  }, [])

  // Any canonical model change (including reset, undo, redo, or an update
  // from elsewhere) replaces the local projection. This effect does not
  // depend on local nodes, so it cannot form a render loop while dragging.
  useEffect(() => {
    const next = prepareRendered(renderDiagram(diagram, selection?.id), hoveredId, actionsFor)
    setNodes(next.nodes)
    setEdges(next.edges)
  }, [actionsFor, diagram, hoveredId, selection])

  const onNodesChange = useCallback((changes: NodeChange<Node<DiagramNodeData>>[]) => {
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]))
      const ownerDeltas = new Map<string, Point>()

      // Attribute nodes are derived from their owner and intentionally are not
      // draggable themselves. Translate them by the same frame delta so their
      // stems and their marker remain attached throughout the drag.
      changes.forEach((change) => {
        if (change.type !== 'position' || !change.position) return
        const owner = currentById.get(change.id)
        if (!owner) return
        const data: any = owner?.data
        if (data?.kind !== 'entity' && data?.kind !== 'relationship') return
        ownerDeltas.set(`${data.kind}:${data.semanticId ?? change.id}`, {
          x: change.position.x - owner.position.x,
          y: change.position.y - owner.position.y,
        })
      })

      const changed = applyNodeChanges<Node<DiagramNodeData>>(changes, current)
      if (ownerDeltas.size === 0) return changed

      return changed.map((node) => {
        const data: any = node.data
        if (data?.kind !== 'attribute') return node
        const delta = ownerDeltas.get(`${data.ownerKind}:${data.ownerId}`)
        const previous = currentById.get(node.id)
        if (!delta || !previous) return node
        return {
          ...node,
          position: {
            x: previous.position.x + delta.x,
            y: previous.position.y + delta.y,
          },
        }
      })
    })
  }, [])

  const selectNode = useCallback((_: React.MouseEvent, node: Node) => {
    const data: any = node.data
    if (data.kind === 'entity' || data.kind === 'relationship') onSelect({ type: data.kind, id: data.semanticId ?? node.id })
    else if (data.ownerId) onSelect({ type: data.ownerKind ?? 'entity', id: data.ownerId })
  }, [onSelect])

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    if (!window.matchMedia?.('(pointer: fine)')?.matches) return
    if (hoverClearTimer.current !== undefined) {
      window.clearTimeout(hoverClearTimer.current)
      hoverClearTimer.current = undefined
    }
    const data: any = node.data
    if (data.kind === 'entity' || data.kind === 'relationship') setHoveredId(data.semanticId ?? node.id)
  }, [])

  const onNodeMouseLeave = useCallback((_: React.MouseEvent, node: Node) => {
    if (!window.matchMedia?.('(pointer: fine)')?.matches) return
    const data: any = node.data
    if (data.kind !== 'entity' && data.kind !== 'relationship') return
    const id = data.semanticId ?? node.id
    if (hoverClearTimer.current !== undefined) window.clearTimeout(hoverClearTimer.current)
    hoverClearTimer.current = window.setTimeout(() => {
      setHoveredId((current) => current === id ? undefined : current)
      hoverClearTimer.current = undefined
    }, 500)
  }, [])

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    const data: any = node.data
    if (data.kind !== 'entity' && data.kind !== 'relationship') return
    onEdit({ type: data.kind, id: data.semanticId ?? node.id })
  }, [onEdit])

  const onConnectStart = useCallback((_: MouseEvent | TouchEvent, params: { nodeId: string | null; handleId: string | null }) => {
    const sourceEntityId = semanticIdFromNodeId(params.nodeId)
    const sourceSide = relationshipHandleSide(params.handleId)
    if (!sourceEntityId || !sourceSide) return
    connectionStart.current = { sourceEntityId, sourceSide }
    connectionCommitted.current = false
  }, [])

  const onConnect = useCallback((connection: Connection) => {
    const sourceEntityId = semanticIdFromNodeId(connection.source)
    const targetEntityId = semanticIdFromNodeId(connection.target)
    const sourceSide = relationshipHandleSide(connection.sourceHandle)
    if (!sourceEntityId || !targetEntityId || !sourceSide) return
    connectionCommitted.current = true
    onRelationshipGesture({ sourceEntityId, targetEntityId, sourceSide })
    connectionStart.current = undefined
  }, [onRelationshipGesture])

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: any) => {
    const started = connectionStart.current
    const sourceEntityId = semanticIdFromNodeId(connectionState.fromNode?.id) ?? started?.sourceEntityId
    const sourceSide = relationshipHandleSide(connectionState.fromHandle?.id) ?? started?.sourceSide
    if (!sourceEntityId || !sourceSide || connectionCommitted.current) {
      connectionStart.current = undefined
      connectionCommitted.current = false
      return
    }
    // A rejected drop over another node is not an empty-canvas gesture. Only
    // a connection with no target node creates the related entity.
    if (connectionState.toNode) {
      connectionStart.current = undefined
      return
    }
    const point = clientPoint(event)
    if (point) {
      const dropPosition = rf.screenToFlowPosition(point, {
        snapToGrid: layoutMode === 'structured',
        snapGrid: [GRID_SIZE, GRID_SIZE],
      })
      onRelationshipGesture({
        sourceEntityId,
        sourceSide,
        touch: 'changedTouches' in event,
        // Keep the new entity centered under the pointer; its top-left
        // remains the canonical position stored by the domain command.
        dropPosition: { x: dropPosition.x - GRID_SIZE * 4, y: dropPosition.y - GRID_SIZE * 2 },
      })
    }
    connectionStart.current = undefined
  }, [layoutMode, onRelationshipGesture, rf])

  const isValidConnection = useCallback((connection: Connection | Edge) => (
    Boolean(
      semanticIdFromNodeId(connection.source) &&
      semanticIdFromNodeId(connection.target) &&
      relationshipHandleSide(connection.sourceHandle)
    )
  ), [])

  return <div className={`canvas-wrap layout-${layoutMode}`}>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={selectNode}
      onNodeDoubleClick={onNodeDoubleClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      onPaneClick={() => onSelect(null)}
      onNodeDragStop={(_, node) => {
        const d: any = node.data
        if (d.kind === 'entity' || d.kind === 'relationship') {
          const id = d.semanticId ?? node.id
          const position = { x: node.position.x, y: node.position.y }
          // One canonical write per completed drag; all pointer-frame updates
          // above stay local, so the completed move is one history entry.
          onMove(id, position)
        }
      }}
      onNodesChange={onNodesChange}
      onConnectStart={onConnectStart}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      isValidConnection={isValidConnection}
      connectionLineType={ConnectionLineType.Step}
      connectOnClick
      snapToGrid={layoutMode === 'structured'}
      snapGrid={[GRID_SIZE, GRID_SIZE]}
      fitView
      fitViewOptions={{ padding: 0.12, minZoom: 0.25, maxZoom: 1.2 }}
      panOnDrag
      panOnScroll={false}
      zoomOnPinch
      zoomOnScroll
      zoomOnDoubleClick={false}
      nodesDraggable
      nodesConnectable
      deleteKeyCode={[]}
      edgesFocusable={false}
      ariaLabelConfig={REACT_FLOW_LABELS}
      proOptions={{ hideAttribution: true }}
      selectionOnDrag={false}
      onlyRenderVisibleElements={false}
      className={`er-flow ${layoutMode === 'structured' ? 'is-structured' : 'is-freeform'}`}
    >
      <Background
        variant={BackgroundVariant.Lines}
        gap={layoutMode === 'structured' ? GRID_SIZE : GRID_SIZE * 2}
        size={1}
        color="var(--grid)"
      />
      <Controls showInteractive={false} showFitView={false} className="rf-controls">
        <button
          type="button"
          className="react-flow__controls-button"
          onClick={() => rf.fitView({ padding: 0.12, minZoom: 0.25, duration: 420 })}
          aria-label="Ajustar vista"
          title="Ajustar vista (F)"
        >
          <Maximize size={16} />
        </button>
      </Controls>
    </ReactFlow>
  </div>
}

function EditorApp() {
  const diagram = useDiagramStore((s: any) => s.diagram)
  const diagrams = useDiagramStore((s: any) => s.diagrams)
  const selection = useDiagramStore((s: any) => s.selection)
  const canUndo = useDiagramStore((s: any) => s.canUndo)
  const canRedo = useDiagramStore((s: any) => s.canRedo)
  const store = useDiagramStore()
  const rf = useReactFlow()
  const [sheet, setSheet] = useState<SheetName>(null)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [draftEntityId, setDraftEntityId] = useState<string>()
  const [draftRelationshipId, setDraftRelationshipId] = useState<string>()
  const [pendingRelationshipRename, setPendingRelationshipRename] = useState<string>()

  const selectedEntity = selection?.type === 'entity' ? diagram.entities.find((e: any) => e.id === selection.id) : undefined
  const selectedRelationship = selection?.type === 'relationship' ? diagram.relationships.find((r: any) => r.id === selection.id) : undefined

  const setSelection = useCallback((next: SemanticSelection) => {
    store.setSelection(next)
    setSheet(null)
  }, [store])

  const deleteTarget = useCallback((target: SemanticSelection) => {
    if (!target) return
    if (target.type === 'entity') store.deleteEntity(target.id)
    else store.deleteRelationship(target.id)
    if (selection?.id === target.id && selection.type === target.type) store.setSelection(null)
    setSheet(null)
  }, [selection, store])

  const closeSheet = useCallback(() => {
    // A keyboard/FAB-created blank entity is a draft until its name is
    // confirmed. Cancelling that flow should not leave a placeholder behind.
    if (draftEntityId) store.deleteEntity(draftEntityId)
    setDraftEntityId(undefined)
    setPendingRelationshipRename(undefined)
    setDraftRelationshipId(undefined)
    setSheet(null)
    setSelectorOpen(false)
  }, [draftEntityId, store])

  const openStoredDiagram = useCallback((id: string) => {
    if (store.openDiagram(id)) {
      setSelectorOpen(false)
      setSheet(null)
    }
  }, [store])

  const createNewDiagram = useCallback(() => {
    store.createDiagram()
    setSelectorOpen(false)
    setSheet(null)
  }, [store])

  const finishEntityEdit = useCallback(() => {
    const relationshipId = pendingRelationshipRename
    setDraftEntityId(undefined)
    setPendingRelationshipRename(undefined)
    if (relationshipId) {
      store.setSelection({ type: 'relationship', id: relationshipId })
      setDraftRelationshipId(relationshipId)
      setSheet('relationshipEdit')
    } else {
      setSheet(null)
    }
  }, [pendingRelationshipRename, store])

  const finishRelationshipEdit = useCallback(() => {
    setDraftRelationshipId(undefined)
    setSheet(null)
  }, [])

  const viewportEntityPosition = useCallback((): Point => {
    const canvas = document.querySelector('.canvas-wrap')?.getBoundingClientRect()
    const center = {
      x: (canvas?.left ?? 0) + (canvas?.width ?? window.innerWidth) / 2,
      y: (canvas?.top ?? 64) + (canvas?.height ?? window.innerHeight - 64) / 2,
    }
    const flowCenter = rf.screenToFlowPosition(center)
    return { x: flowCenter.x - 96, y: flowCenter.y - 48 }
  }, [rf])

  const startEntityCreation = useCallback(() => {
    const id = store.createEntity('Sin nombre', 'strong', viewportEntityPosition())
    store.setSelection({ type: 'entity', id })
    setDraftEntityId(id)
    setSheet('entity')
  }, [store, viewportEntityPosition])

  const openNodeAction = useCallback((target: NodeTarget, nextSheet: SheetName) => {
    store.setSelection(target)
    setSheet(nextSheet)
  }, [store])

  const openNodeEdit = useCallback((target: NodeTarget) => {
    openNodeAction(target, target.type === 'entity' ? 'entity' : 'relationshipEdit')
  }, [openNodeAction])

  const actionsFor = useCallback((target: NodeTarget): NodeActionHandlers => ({
    addAttribute: () => openNodeAction(target, 'attribute'),
    createRelationship: target.type === 'entity' ? () => openNodeAction(target, 'relationship') : undefined,
    rename: () => openNodeAction(target, target.type === 'entity' ? 'entity' : 'relationshipEdit'),
    editCardinality: target.type === 'relationship' ? () => openNodeAction(target, 'cardinality') : undefined,
    delete: () => deleteTarget(target),
  }), [deleteTarget, openNodeAction])

  const handleRelationshipGesture = useCallback((gesture: RelationshipGesture) => {
    const target = gesture.targetEntityId ?? {
      position: gesture.dropPosition ?? viewportEntityPosition(),
      kind: 'strong' as const,
    }
    const result = store.createRelationshipFlow(
      gesture.sourceEntityId,
      target,
      'Sin nombre',
      { sourceSide: gesture.sourceSide, cardinalitiesPending: true },
    )
    if (!result) return

    if (gesture.targetEntityId) {
      store.setSelection({ type: 'relationship', id: result.relationshipId })
      setDraftRelationshipId(result.relationshipId)
      setSheet('relationshipEdit')
      return
    }

    store.setSelection({ type: 'entity', id: result.entityId })
    if (gesture.touch || window.matchMedia?.('(pointer: coarse)')?.matches) {
      // Touch drops stay deliberately non-modal: the new entity is selected
      // with placeholders in place, and the existing action bar remains the
      // quickest way to rename/configure either object.
      setSheet(null)
      return
    }
    setDraftEntityId(result.entityId)
    setPendingRelationshipRename(result.relationshipId)
    setSheet('entity')
  }, [store, viewportEntityPosition])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : undefined
      if (event.key === 'Escape') {
        event.preventDefault()
        if (selectorOpen) setSelectorOpen(false)
        else if (sheet) closeSheet()
        else store.setSelection(null)
        return
      }
      if (
        target?.matches('input, textarea, select, [contenteditable="true"]') ||
        target?.isContentEditable ||
        target?.closest('[role="dialog"]')
      ) return

      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) store.redo()
        else store.undo()
      } else if ((event.metaKey || event.ctrlKey) && key === 'y') {
        event.preventDefault()
        store.redo()
      } else if (key === 'e') {
        event.preventDefault()
        startEntityCreation()
      } else if (key === 'a' && selection) {
        event.preventDefault()
        setSheet('attribute')
      } else if (key === 'r' && selection?.type === 'entity') {
        event.preventDefault()
        setSheet('relationship')
      } else if (key === 'enter' && selection) {
        event.preventDefault()
        setSheet(selection.type === 'entity' ? 'entity' : 'relationshipEdit')
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
        event.preventDefault()
        deleteTarget(selection)
      } else if (key === 'f') {
        event.preventDefault()
        rf.fitView({ padding: 0.12, minZoom: 0.25, duration: 420 })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeSheet, deleteTarget, rf, selection, selectorOpen, sheet, startEntityCreation, store])

  useEffect(() => { if (toast) { const t = window.setTimeout(() => setToast(''), 2400); return () => window.clearTimeout(t) } }, [toast])

  useEffect(() => {
    if (!selectorOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && (target.closest('.diagram-selector') || target.closest('.diagram-title'))) return
      setSelectorOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [selectorOpen])

  useEffect(() => {
    if (diagram) syncSystemUi(diagram.view)
  }, [diagram])

  const deleteSelected = () => deleteTarget(selection)

  if (!diagram) return <main className="loading">Cargando Nightingale Schema…</main>

  return <main className={`app-shell theme-${diagram.view.theme}`} style={customStyle(diagram.view.customTheme)} aria-label="Nightingale Schema">
    <header className="topbar">
      <div className="top-left">
        <div className="product-lockup" aria-label="Nightingale Schema">
          <NightingaleMark />
          <span>Nightingale Schema</span>
        </div>
        <span className="topbar-divider" aria-hidden="true" />
        <button
          className="diagram-title"
          onClick={() => { setSheet(null); setSelectorOpen((open) => !open) }}
          aria-label={`${diagram.name || 'Diagrama sin título'}, cambiar de diagrama`}
          aria-expanded={selectorOpen}
          aria-haspopup="listbox"
          title="Cambiar de diagrama"
        >
          {diagram.name || 'Diagrama sin título'} <ChevronDown size={14} />
        </button>
      </div>
      <div className="top-actions">
        <button className="icon-button" disabled={!canUndo} onClick={store.undo} aria-label="Deshacer" title="Deshacer (⌘/Ctrl+Z)"><Undo2 size={18} /></button>
        <button className="icon-button" disabled={!canRedo} onClick={store.redo} aria-label="Rehacer" title="Rehacer (⌘/Ctrl+Shift+Z)"><Redo2 size={18} /></button>
        <button className="icon-button" onClick={() => { setSelectorOpen(false); setSheet('menu') }} aria-label="Ajustes" title="Ajustes del diagrama"><Settings size={18} /></button>
      </div>
    </header>
    {selectorOpen && <DiagramSelector currentId={diagram.id} diagrams={diagrams} onSelect={openStoredDiagram} onSeeMore={() => { setSelectorOpen(false); setSheet('library') }} onCreate={createNewDiagram} />}
    <CanvasViewport diagram={diagram} selection={selection} onSelect={setSelection} onMove={store.setPosition} onEdit={openNodeEdit} actionsFor={actionsFor} onRelationshipGesture={handleRelationshipGesture} />
    {!selection && <button className="fab" onClick={startEntityCreation} aria-label="Crear entidad" title="Crear entidad (E)"><Plus size={27} /><span>Nueva entidad</span></button>}
    {selection && <ContextBar selection={selection} onAction={setSheet} onDelete={deleteSelected} />}
    {toast && <div className="toast">{toast}</div>}
    {sheet && <DialogScreen title={sheetTitle(sheet, selectedEntity, selectedRelationship)} onClose={closeSheet}>
      {sheet === 'entity' && <EntityForm entity={selectedEntity} draft={draftEntityId === selectedEntity?.id} onDone={finishEntityEdit} store={store} />}
      {sheet === 'attribute' && <AttributeEditor ownerType={selectedEntity ? 'entity' : 'relationship'} owner={selectedEntity ?? selectedRelationship} onDone={() => setSheet(null)} store={store} />}
      {sheet === 'relationship' && <RelationshipFlow selectedEntity={selectedEntity} entities={diagram.entities} store={store} onDone={() => setSheet(null)} />}
      {sheet === 'relationshipEdit' && selectedRelationship && <RelationshipEditor relationship={selectedRelationship} draft={draftRelationshipId === selectedRelationship.id} store={store} onDone={finishRelationshipEdit} />}
      {sheet === 'cardinality' && selectedRelationship && <CardinalityEditor relationship={selectedRelationship} entities={diagram.entities} store={store} onDone={() => setSheet(null)} />}
      {sheet === 'library' && <DiagramLibrary currentId={diagram.id} diagrams={diagrams} onSelect={openStoredDiagram} onCreate={createNewDiagram} />}
      {sheet === 'menu' && <DiagramMenu diagram={diagram} view={diagram.view} store={store} onClose={() => setSheet(null)} onToast={setToast} />}
    </DialogScreen>}
  </main>
}

function diagramSummary(diagram: Diagram) {
  const entityLabel = diagram.entities.length === 1 ? 'entidad' : 'entidades'
  const relationshipLabel = diagram.relationships.length === 1 ? 'relación' : 'relaciones'
  return `${diagram.entities.length} ${entityLabel} · ${diagram.relationships.length} ${relationshipLabel}`
}

function DiagramSelector({ currentId, diagrams, onSelect, onSeeMore, onCreate }: {
  currentId: string
  diagrams: Diagram[]
  onSelect: (id: string) => void
  onSeeMore: () => void
  onCreate: () => void
}) {
  const recent = diagrams.slice(0, 3)
  return <div className="diagram-selector" role="listbox" aria-label="Diagramas recientes">
    <div className="selector-heading"><LayoutList size={15} /><span>Diagramas recientes</span></div>
    <div className="selector-list">
      {recent.map((item) => <button
        type="button"
        className={`selector-diagram${item.id === currentId ? ' is-current' : ''}`}
        key={item.id}
        role="option"
        aria-selected={item.id === currentId}
        onClick={() => onSelect(item.id)}
      >
        <span className="selector-diagram-copy"><strong>{item.name || 'Diagrama sin título'}</strong><small>{diagramSummary(item)}</small></span>
        {item.id === currentId && <Check size={16} aria-label="Diagrama actual" />}
      </button>)}
    </div>
    <button type="button" className="selector-action selector-see-more" onClick={onSeeMore}><span>Ver todos los diagramas</span><ChevronRight size={17} /></button>
    <button type="button" className="selector-action selector-create" onClick={onCreate}><FilePlus2 size={17} /><span>Nuevo diagrama</span></button>
  </div>
}

function DiagramLibrary({ currentId, diagrams, onSelect, onCreate }: {
  currentId: string
  diagrams: Diagram[]
  onSelect: (id: string) => void
  onCreate: () => void
}) {
  return <div className="library-stack dialog-stack">
    <p className="library-intro">Elige un diagrama para continuar trabajando en él.</p>
    <div className="library-list" role="listbox" aria-label="Todos los diagramas">
      {diagrams.map((item) => <button
        type="button"
        className={`library-diagram${item.id === currentId ? ' is-current' : ''}`}
        key={item.id}
        role="option"
        aria-selected={item.id === currentId}
        onClick={() => onSelect(item.id)}
      >
        <span className="library-diagram-mark" aria-hidden="true"><LayoutList size={17} /></span>
        <span className="library-diagram-copy"><strong>{item.name || 'Diagrama sin título'}</strong><small>{diagramSummary(item)}</small></span>
        {item.id === currentId ? <Check size={17} aria-label="Diagrama actual" /> : <ChevronRight size={17} />}
      </button>)}
    </div>
    <button type="button" className="library-create primary-button" onClick={onCreate}><FilePlus2 size={17} />Nuevo diagrama</button>
  </div>
}

function ContextBar({ selection, onAction, onDelete }: { selection: NonNullable<SemanticSelection>; onAction: (s: SheetName) => void; onDelete: () => void }) {
  const entity = selection.type === 'entity'
  return <nav className="context-bar" aria-label="Acciones del elemento seleccionado">
    <button onClick={() => onAction('attribute')} title="Añadir atributo (A)"><Type size={17} /><span>Atributo</span></button>
    {entity ? <button onClick={() => onAction('relationship')} title="Crear relación (R)"><Link2 size={17} /><span>Relacionar</span></button> : <button onClick={() => onAction('cardinality')} title="Editar cardinalidad"><Link2 size={17} /><span>Cardinalidad</span></button>}
    <button onClick={() => onAction(entity ? 'entity' : 'relationshipEdit')} title="Renombrar (Enter)"><Pencil size={17} /><span>Editar</span></button>
    <button className="danger-ghost" onClick={onDelete} title="Eliminar (Delete/Backspace)"><Trash2 size={17} /><span>Eliminar</span></button>
  </nav>
}

function EntityForm({ entity, draft, onDone, store }: any) {
  const [name, setName] = useState(draft ? '' : entity?.name ?? '')
  const [kind, setKind] = useState<'strong' | 'weak'>(entity?.kind ?? 'strong')
  const submit = (e: React.FormEvent) => { e.preventDefault(); const clean = name.trim(); if (!clean) return; if (entity) { store.renameEntity(entity.id, clean); if (entity.kind !== kind) store.setEntityKind(entity.id, kind) } else { const id = store.createEntity(clean, kind); store.setSelection({ type: 'entity', id }) } onDone() }
  return <form className="form-stack dialog-form" onSubmit={submit}><label>Nombre<EditorTextInput autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="p. ej. ESTUDIANTE" /></label><div className="choice-label">Tipo de entidad</div><div className="segmented"><button type="button" className={kind === 'strong' ? 'active' : ''} onClick={() => setKind('strong')}><span className="mini-entity" />Fuerte</button><button type="button" className={kind === 'weak' ? 'active' : ''} onClick={() => setKind('weak')}><SquareDashed size={18} />Débil</button></div><button className="primary-button dialog-submit" disabled={!name.trim()}><Check size={17} />{entity ? 'Guardar cambios' : 'Crear entidad'}</button></form>
}

function AttributeEditor({ ownerType, owner, onDone, store }: any) {
  const attrs = owner?.attributes ?? []
  const [name, setName] = useState('')
  const [key, setKey] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (editing) store.updateAttribute(ownerType, owner.id, editing.id, { name: name.trim(), key })
    else store.addAttribute(ownerType, owner.id, name.trim(), key)
    setName('')
    setKey(false)
    setEditing(null)
    nameInputRef.current?.focus({ preventScroll: true })
    window.requestAnimationFrame(() => nameInputRef.current?.focus({ preventScroll: true }))
  }
  return <div className="form-stack dialog-form"><div className="attribute-list">{attrs.length === 0 && <p className="empty-note">Todavía no hay atributos.</p>}{attrs.map((a: any) => <div className="attribute-row" key={a.id}><span className={a.key ? 'key-dot filled' : 'key-dot'} /> <span>{a.name}</span>{a.key && <KeyRound size={13} /> }<button onClick={() => { setEditing(a); setName(a.name); setKey(a.key) }} aria-label={`Editar ${a.name}`}><Pencil size={14} /></button><button onClick={() => store.deleteAttribute(ownerType, owner.id, a.id)} aria-label={`Eliminar ${a.name}`}><Trash2 size={14} /></button></div>)}</div><form onSubmit={save} className="attribute-add dialog-attribute-form"><label>{editing ? 'Editar atributo' : 'Nuevo atributo'}<EditorTextInput ref={nameInputRef} autoFocus={!editing} value={name} onChange={e => setName(e.target.value)} placeholder="p. ej. nombre" /></label><label className="check-label"><input type="checkbox" checked={key} onChange={e => setKey(e.target.checked)} /> <span className="key-dot filled" /> Es atributo clave</label><div className="form-actions"><button type="button" className="secondary-button" onClick={() => { if (editing) { setEditing(null); setName(''); setKey(false) } else onDone() }}>{editing ? 'Cancelar' : 'Cerrar'}</button><button className="primary-button" disabled={!name.trim()}>{editing ? 'Guardar' : 'Añadir'}</button></div></form></div>
}

const RECURSIVE_TARGET = '__recursive__'

function RelationshipFlow({ selectedEntity, entities, store, onDone }: any) {
  const [target, setTarget] = useState<string>('new')
  const [targetName, setTargetName] = useState('')
  const [name, setName] = useState('')
  const [from, setFrom] = useState<Cardinality>({ min: 0, max: 'n' })
  const [to, setTo] = useState<Cardinality>({ min: 0, max: 'n' })
  const otherEntities = entities.filter((entity: any) => entity.id !== selectedEntity?.id)
  const targetEntity = entities.find((entity: any) => entity.id === target)
  const targetEntityName = target === 'new'
    ? (targetName || 'Nueva entidad')
    : target === RECURSIVE_TARGET
      ? selectedEntity?.name ?? 'Esta entidad'
      : targetEntity?.name ?? 'Entidad destino'
  const targetLabel = target === RECURSIVE_TARGET ? `${targetEntityName} · rol 2` : targetEntityName
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEntity || !name.trim()) return
    const relationshipTarget = target === 'new'
      ? { name: targetName.trim() || undefined }
      : target === RECURSIVE_TARGET
        ? selectedEntity.id
        : target
    const result = store.createRelationshipFlow(
      selectedEntity.id,
      relationshipTarget,
      name.trim(),
      { cardinalities: [from, to] },
    )
    if (!result) return
    store.setSelection({ type: 'relationship', id: result.relationshipId })
    onDone()
  }
  return <form className="form-stack dialog-form" onSubmit={submit}>
    <p className="flow-intro">Relacionar <strong>{selectedEntity?.name}</strong> con…</p>
    <div className="target-options">
      <label className="radio-card">
        <input type="radio" checked={target === 'new'} onChange={() => setTarget('new')} />
        <span>Crear nueva entidad</span>
      </label>
      <label className={`radio-card${otherEntities.length ? '' : ' is-disabled'}`}>
        <input
          type="radio"
          disabled={!otherEntities.length}
          checked={target !== 'new' && target !== RECURSIVE_TARGET}
          onChange={(e) => { if (e.target.checked) setTarget(otherEntities[0]?.id ?? 'new') }}
        />
        <span>Entidad existente</span>
      </label>
      <label className={`radio-card${selectedEntity ? '' : ' is-disabled'}`}>
        <input
          type="radio"
          disabled={!selectedEntity}
          checked={target === RECURSIVE_TARGET}
          onChange={(e) => { if (e.target.checked) setTarget(RECURSIVE_TARGET) }}
        />
        <span>Recursiva</span>
      </label>
    </div>
    {target === 'new'
      ? <label>Nombre de la entidad<EditorTextInput autoFocus value={targetName} onChange={e => setTargetName(e.target.value)} placeholder="p. ej. CURSO" /></label>
      : target === RECURSIVE_TARGET
        ? <p className="empty-note">La relación conectará <strong>{selectedEntity?.name}</strong> consigo misma.</p>
        : <label>Entidad destino<select value={target} onChange={e => setTarget(e.target.value)}>{otherEntities.map((entity: any) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>}
    <label>Nombre de la relación<EditorTextInput value={name} onChange={e => setName(e.target.value)} placeholder="p. ej. INSCRIBE" /></label>
    <div className="cardinality-grid">
      <CardinalitySelect label={selectedEntity?.name ?? 'Origen'} value={from} onChange={setFrom} />
      <CardinalitySelect label={targetLabel} value={to} onChange={setTo} />
    </div>
    <div className="cardinality-explanations">
      <CardinalityExplanation entityName={selectedEntity?.name ?? 'Origen'} relationshipName={name || 'esta relación'} value={from} />
      <CardinalityExplanation entityName={targetEntityName} relationshipName={name || 'esta relación'} value={to} />
    </div>
    <button className="primary-button dialog-submit" disabled={!name.trim() || (target === 'new' && !targetName.trim())}><Link2 size={17} />Crear relación</button>
  </form>
}

function CardinalitySelect({ label, value, onChange }: { label?: string; value: Cardinality; onChange: (c: Cardinality) => void }) {
  return <label>{label}<select value={cardinalityLabel(value)} onChange={e => onChange(parseCardinalityLabel(e.target.value))}><option value="(0,1)">(0,1)</option><option value="(1,1)">(1,1)</option><option value="(0,n)">(0,n)</option><option value="(1,n)">(1,n)</option></select></label>
}

function CardinalityExplanation({ entityName, relationshipName, value }: { entityName: string; relationshipName: string; value: Cardinality }) {
  const meaning = describeCardinality(value, entityName, relationshipName)
  return <div className="cardinality-explanation"><div className="cardinality-summary"><code>{meaning.code}</code><span>{meaning.participation} · {meaning.multiplicity}</span></div><p>{meaning.sentence}</p></div>
}

function RelationshipEditor({ relationship, draft, store, onDone }: any) {
  const [name, setName] = useState(draft ? '' : relationship.name)
  const save = (e: React.FormEvent) => { e.preventDefault(); if (name.trim()) store.renameRelationship(relationship.id, name.trim()); onDone() }
  return <form className="form-stack dialog-form" onSubmit={save}><label>Nombre de la relación<EditorTextInput autoFocus value={name} onChange={e => setName(e.target.value)} /></label><button className="primary-button dialog-submit" disabled={!name.trim()}><Check size={17} />Guardar cambios</button></form>
}

function CardinalityEditor({ relationship, entities, store, onDone }: any) {
  const [parts, setParts] = useState(relationship.participants.map((p: any) => ({ ...p.cardinality })))
  const participantCounts = relationship.participants.reduce((counts: Record<string, number>, participant: any) => {
    counts[participant.entityId] = (counts[participant.entityId] ?? 0) + 1
    return counts
  }, {})
  const save = (e: React.FormEvent) => { e.preventDefault(); relationship.participants.forEach((p: any, i: number) => store.updateParticipant(relationship.id, p.entityId, parts[i], i)); onDone() }
  return <form className="form-stack dialog-form" onSubmit={save}>
    {relationship.participants.map((p: any, i: number) => {
      const entityName = entities.find((e: any) => e.id === p.entityId)?.name ?? 'esta entidad'
      const label = (participantCounts[p.entityId] ?? 0) > 1 ? `${entityName} · rol ${i + 1}` : entityName
      return <div className="cardinality-option" key={`${p.entityId}-${i}`}>
        <CardinalitySelect label={label} value={parts[i]} onChange={c => setParts((old: any[]) => old.map((v, n) => n === i ? c : v))} />
        <CardinalityExplanation entityName={entityName} relationshipName={relationship.name || 'esta relación'} value={parts[i]} />
      </div>
    })}
    <button className="primary-button dialog-submit"><Check size={17} />Guardar cardinalidades</button>
  </form>
}

function AppearanceEditor({ view, store, onDone }: any) {
  const [custom, setCustom] = useState<CustomTheme>(view.customTheme ?? { background: '#fbf9f4', entity: '#ffffff', relationship: '#f6e3da', ink: '#1c1915', font: 'serif' })
  const layoutMode = view.layoutMode ?? 'structured'
  return <div className="appearance-stack dialog-stack"><p className="section-kicker">Estilo del diagrama</p><div className="theme-grid">{([['academic', 'Académico', 'paper'], ['warm', 'Cálido', 'warm'], ['modern', 'Moderno', 'modern']] as const).map(([id, label, klass]) => <button type="button" className={`theme-card ${view.theme === id ? 'selected' : ''}`} key={id} onClick={() => store.setTheme(id)}><span className={`theme-preview ${klass}`}><b /><i /></span><span>{label}</span></button>)}</div><div className="layout-mode-section"><p className="section-kicker">Distribución</p><div className="segmented layout-mode-toggle" role="group" aria-label="Modo de distribución del diagrama"><button type="button" className={layoutMode === 'structured' ? 'active' : ''} aria-pressed={layoutMode === 'structured'} onClick={() => store.setLayoutMode('structured')}>Estructurado</button><button type="button" className={layoutMode === 'freeform' ? 'active' : ''} aria-pressed={layoutMode === 'freeform'} onClick={() => store.setLayoutMode('freeform')}>Libre</button></div><p className="layout-mode-help">Estructurado ajusta entidades y relaciones a una cuadrícula de 24 px.</p></div><div className="custom-toggle"><span>Colores personalizados</span><small>Opcional</small></div><div className="color-fields">{([['background', 'Fondo'], ['entity', 'Entidad'], ['relationship', 'Relación'], ['ink', 'Tinta']] as const).map(([key, label]) => <label key={key}>{label}<input type="color" value={custom[key]} onChange={e => { const next = { ...custom, [key]: e.target.value }; setCustom(next); store.setTheme('custom'); store.updateCustomTheme(next) }} /></label>)}</div><label className="font-select">Tipografía<select value={custom.font} onChange={e => { const font = e.target.value as 'serif' | 'sans'; const next = { ...custom, font }; setCustom(next); store.setTheme('custom'); store.updateCustomTheme(next) }}><option value="serif">Serif académica</option><option value="sans">Sans moderna</option></select></label><button type="button" className="secondary-button full-button dialog-submit" onClick={onDone}>Listo</button></div>
}

function DiagramMenu({ diagram, view, store, onClose, onToast }: any) {
  const [name, setName] = useState(diagram.name)
  const rename = (e: React.FormEvent) => { e.preventDefault(); if (name.trim()) store.setDiagramName(name.trim()); onClose() }
  const reset = (mode: 'blank' | 'sample') => { if (window.confirm(mode === 'blank' ? '¿Crear un diagrama vacío? Se reemplazará el contenido actual.' : '¿Restaurar el diagrama de ejemplo?')) { store.resetDiagram(mode); onClose(); onToast('Diagrama actualizado') } }
  return <div className="menu-stack dialog-stack"><form onSubmit={rename} className="form-stack dialog-form"><label>Nombre del diagrama<EditorTextInput value={name} onChange={e => setName(e.target.value)} /></label><button className="primary-button dialog-submit" disabled={!name.trim()}><Check size={17} />Guardar nombre</button></form><div className="menu-divider" /><button className="menu-action" onClick={() => { store.reflowAttributes(); onClose(); onToast('Atributos redistribuidos') }}><Type size={18} /><span>Redistribuir atributos</span></button><div className="shortcut-list" aria-label="Atajos de teclado"><p className="section-kicker">Atajos de teclado</p><div><kbd>E</kbd><span>Nueva entidad</span><kbd>A</kbd><span>Atributo</span></div><div><kbd>R</kbd><span>Relación</span><kbd>Enter</kbd><span>Renombrar</span></div><div><kbd>F</kbd><span>Ajustar vista</span><kbd>⌘/Ctrl Z</kbd><span>Deshacer</span></div></div><div className="menu-divider" /><button className="menu-action" onClick={() => reset('blank')}><Plus size={18} /><span>Nuevo diagrama</span></button><button className="menu-action" onClick={() => reset('sample')}><SquareDashed size={18} /><span>Restaurar ejemplo</span></button><div className="menu-divider" /><AppearanceEditor view={view} store={store} onDone={onClose} /></div>
}

function customStyle(theme?: CustomTheme): React.CSSProperties | undefined {
  if (!theme) return undefined
  return { '--custom-bg': theme.background, '--custom-entity': theme.entity, '--custom-relationship': theme.relationship, '--custom-ink': theme.ink, '--custom-font': theme.font === 'serif' ? 'Newsreader, Georgia, serif' : 'Host Grotesk, system-ui, sans-serif' } as React.CSSProperties
}

function sheetTitle(sheet: SheetName, entity: any, relationship: any) {
  if (sheet === 'entity') return entity ? 'Editar entidad' : 'Nueva entidad'
  if (sheet === 'attribute') return `Atributos de ${entity?.name ?? relationship?.name ?? ''}`
  if (sheet === 'relationship') return 'Nueva relación'
  if (sheet === 'relationshipEdit') return 'Editar relación'
  if (sheet === 'cardinality') return 'Cardinalidades'
  return 'Ajustes del diagrama'
}

export default function App() { return <ReactFlowProvider><EditorApp /></ReactFlowProvider> }
