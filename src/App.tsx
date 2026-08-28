/* eslint-disable @typescript-eslint/no-explicit-any -- UI adapters intentionally accept renderer/store payloads. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
} from '@xyflow/react'
import {
  Plus, MoreHorizontal, Undo2, Redo2, Maximize, Type, Link2, Pencil,
  Trash2, Palette, X, Check, ChevronDown, KeyRound, SquareDashed,
} from 'lucide-react'
import '@xyflow/react/dist/style.css'
import './styles/app.css'
import { useDiagramStore } from './domain/store'
import type { Cardinality, CustomTheme, Point, SemanticSelection } from './domain/types'
import { cardinalityLabel } from './domain/types'
import { renderDiagram, nodeTypes, edgeTypes } from './renderers/chen-stem'

type SheetName = 'entity' | 'attribute' | 'relationship' | 'relationshipEdit' | 'cardinality' | 'appearance' | 'menu' | null

function CanvasViewport({ diagram, selection, onSelect, onMove }: {
  diagram: any; selection: SemanticSelection; onSelect: (s: SemanticSelection) => void; onMove: (id: string, p: { x: number; y: number }) => void
}) {
  const rf = useReactFlow()
  // React Flow is controlled by the semantic projection, but positions are
  // intentionally persisted only once a drag finishes. Keep the in-progress
  // position local so the node and all of its derived edges can follow the
  // pointer without creating a store update for every pointer event.
  const [dragPositions, setDragPositions] = useState<Record<string, Point>>({})
  const rendered = useMemo(() => {
    const activePositions = Object.keys(dragPositions).length > 0
      ? { ...diagram.view.positions, ...dragPositions }
      : diagram.view.positions
    const renderDiagramSource = activePositions === diagram.view.positions
      ? diagram
      : { ...diagram, view: { ...diagram.view, positions: activePositions } }
    return renderDiagram(renderDiagramSource, selection?.id)
  }, [diagram, selection, dragPositions])

  // If the model changes while a drag is being cancelled/interrupted (for
  // example by deleting or resetting the diagram), never let an old transient
  // position override the next canonical projection.
  useEffect(() => {
    setDragPositions({})
  }, [diagram])

  const selectNode = useCallback((_: React.MouseEvent, node: Node) => {
    const data: any = node.data
    if (data.kind === 'entity' || data.kind === 'relationship') onSelect({ type: data.kind, id: data.semanticId ?? node.id })
    else if (data.ownerId) onSelect({ type: data.ownerKind ?? 'entity', id: data.ownerId })
  }, [onSelect])

  return <div className="canvas-wrap">
    <ReactFlow
      nodes={rendered.nodes}
      edges={rendered.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={selectNode}
      onPaneClick={() => onSelect(null)}
      onNodeDrag={(_, node) => {
        const d: any = node.data
        if (d.kind === 'entity' || d.kind === 'relationship') {
          setDragPositions((current) => ({
            ...current,
            [d.semanticId ?? node.id]: { x: node.position.x, y: node.position.y },
          }))
        }
      }}
      onNodeDragStop={(_, node) => {
        const d: any = node.data
        if (d.kind === 'entity' || d.kind === 'relationship') {
          const id = d.semanticId ?? node.id
          const position = { x: node.position.x, y: node.position.y }
          // One canonical write per completed drag; transient updates above
          // stay local and therefore do not pollute persistence/history.
          onMove(id, position)
          setDragPositions((current) => {
            if (!(id in current)) return current
            const next = { ...current }
            delete next[id]
            return next
          })
        }
      }}
      fitView
      fitViewOptions={{ padding: 0.12, minZoom: 0.25, maxZoom: 1.2 }}
      panOnDrag
      panOnScroll={false}
      zoomOnPinch
      zoomOnScroll
      zoomOnDoubleClick={false}
      nodesDraggable
      nodesConnectable={false}
      edgesFocusable={false}
      proOptions={{ hideAttribution: true }}
      selectionOnDrag={false}
      onlyRenderVisibleElements={false}
      className="er-flow"
    >
      <Background gap={28} size={1} color="var(--grid)" />
      <Controls showInteractive={false} className="rf-controls" />
      <MiniMap pannable zoomable nodeColor="var(--minimap-node)" className="rf-minimap" />
    </ReactFlow>
    <button className="fit-button" onClick={() => rf.fitView({ padding: 0.12, minZoom: 0.25, duration: 420 })} aria-label="Ajustar vista"><Maximize size={16} /> <span>Ajustar</span></button>
  </div>
}

function EditorApp() {
  const diagram = useDiagramStore((s: any) => s.diagram)
  const selection = useDiagramStore((s: any) => s.selection)
  const canUndo = useDiagramStore((s: any) => s.canUndo)
  const canRedo = useDiagramStore((s: any) => s.canRedo)
  const store = useDiagramStore()
  const [sheet, setSheet] = useState<SheetName>(null)
  const [toast, setToast] = useState('')

  const selectedEntity = selection?.type === 'entity' ? diagram.entities.find((e: any) => e.id === selection.id) : undefined
  const selectedRelationship = selection?.type === 'relationship' ? diagram.relationships.find((r: any) => r.id === selection.id) : undefined

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target?.matches('input, textarea, select') || target?.isContentEditable) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) store.redo(); else store.undo() }
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); store.redo() }
      else if (event.key === 'Escape') { setSheet(null); store.setSelection(null) }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selection) { event.preventDefault(); if (selection.type === 'entity') store.deleteEntity(selection.id); else store.deleteRelationship(selection.id); store.setSelection(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, store])

  useEffect(() => { if (toast) { const t = window.setTimeout(() => setToast(''), 2400); return () => window.clearTimeout(t) } }, [toast])

  const setSelection = (next: SemanticSelection) => { store.setSelection(next); setSheet(null) }
  const deleteSelected = () => { if (selection?.type === 'entity') store.deleteEntity(selection.id); if (selection?.type === 'relationship') store.deleteRelationship(selection.id); store.setSelection(null); setSheet(null) }

  if (!diagram) return <main className="loading">Cargando el lienzo…</main>

  return <main className={`app-shell theme-${diagram.view.theme}`} style={customStyle(diagram.view.customTheme)}>
    <header className="topbar">
      <div className="brand-mark" aria-hidden="true">∿</div>
      <button className="diagram-title" onClick={() => setSheet('menu')} title="Opciones del diagrama">{diagram.name || 'Diagrama sin título'} <ChevronDown size={14} /></button>
      <div className="top-actions">
        <button className="icon-button" disabled={!canUndo} onClick={store.undo} aria-label="Deshacer"><Undo2 size={18} /></button>
        <button className="icon-button" disabled={!canRedo} onClick={store.redo} aria-label="Rehacer"><Redo2 size={18} /></button>
        <button className="icon-button" onClick={() => setSheet('appearance')} aria-label="Apariencia"><Palette size={18} /></button>
        <button className="icon-button" onClick={() => setSheet('menu')} aria-label="Más opciones"><MoreHorizontal size={20} /></button>
      </div>
    </header>
    <CanvasViewport diagram={diagram} selection={selection} onSelect={setSelection} onMove={store.setPosition} />
    {!selection && <button className="fab" onClick={() => setSheet('entity')} aria-label="Crear entidad"><Plus size={27} /><span>Nueva entidad</span></button>}
    {selection && <ContextBar selection={selection} onAction={setSheet} onDelete={deleteSelected} />}
    {toast && <div className="toast">{toast}</div>}
    {sheet && <Sheet title={sheetTitle(sheet, selectedEntity, selectedRelationship)} onClose={() => setSheet(null)}>
      {sheet === 'entity' && <EntityForm entity={selectedEntity} onDone={() => setSheet(null)} store={store} />}
      {sheet === 'attribute' && <AttributeEditor ownerType={selectedEntity ? 'entity' : 'relationship'} owner={selectedEntity ?? selectedRelationship} onDone={() => setSheet(null)} store={store} />}
      {sheet === 'relationship' && <RelationshipFlow selectedEntity={selectedEntity} entities={diagram.entities} store={store} onDone={() => setSheet(null)} />}
      {sheet === 'relationshipEdit' && selectedRelationship && <RelationshipEditor relationship={selectedRelationship} store={store} onDone={() => setSheet(null)} />}
      {sheet === 'cardinality' && selectedRelationship && <CardinalityEditor relationship={selectedRelationship} entities={diagram.entities} store={store} onDone={() => setSheet(null)} />}
      {sheet === 'appearance' && <AppearanceEditor view={diagram.view} store={store} onDone={() => setSheet(null)} />}
      {sheet === 'menu' && <DiagramMenu diagram={diagram} store={store} onClose={() => setSheet(null)} onToast={setToast} />}
    </Sheet>}
  </main>
}

function ContextBar({ selection, onAction, onDelete }: { selection: NonNullable<SemanticSelection>; onAction: (s: SheetName) => void; onDelete: () => void }) {
  const entity = selection.type === 'entity'
  return <nav className="context-bar" aria-label="Acciones del elemento seleccionado">
    <button onClick={() => onAction('attribute')}><Type size={17} /><span>Atributo</span></button>
    {entity ? <button onClick={() => onAction('relationship')}><Link2 size={17} /><span>Relacionar</span></button> : <button onClick={() => onAction('cardinality')}><Link2 size={17} /><span>Cardinalidad</span></button>}
    <button onClick={() => onAction(entity ? 'entity' : 'relationshipEdit')}><Pencil size={17} /><span>Editar</span></button>
    <button className="danger-ghost" onClick={onDelete}><Trash2 size={17} /><span>Eliminar</span></button>
  </nav>
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="sheet-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose() }}><section className="sheet" role="dialog" aria-modal="true" aria-label={title}><div className="sheet-handle" /><header className="sheet-header"><h2>{title}</h2><button className="close-button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button></header>{children}</section></div>
}

function EntityForm({ entity, onDone, store }: any) {
  const [name, setName] = useState(entity?.name ?? '')
  const [kind, setKind] = useState<'strong' | 'weak'>(entity?.kind ?? 'strong')
  const submit = (e: React.FormEvent) => { e.preventDefault(); const clean = name.trim(); if (!clean) return; if (entity) { store.renameEntity(entity.id, clean); store.setEntityKind(entity.id, kind) } else { const id = store.createEntity(clean, kind); store.setSelection({ type: 'entity', id }) } onDone() }
  return <form className="form-stack" onSubmit={submit}><label>Nombre<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="p. ej. ESTUDIANTE" /></label><div className="choice-label">Tipo de entidad</div><div className="segmented"><button type="button" className={kind === 'strong' ? 'active' : ''} onClick={() => setKind('strong')}><span className="mini-entity" />Fuerte</button><button type="button" className={kind === 'weak' ? 'active' : ''} onClick={() => setKind('weak')}><SquareDashed size={18} />Débil</button></div><button className="primary-button" disabled={!name.trim()}><Check size={17} />{entity ? 'Guardar cambios' : 'Crear entidad'}</button></form>
}

function AttributeEditor({ ownerType, owner, onDone, store }: any) {
  const attrs = owner?.attributes ?? []
  const [name, setName] = useState('')
  const [key, setKey] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const save = (e: React.FormEvent) => { e.preventDefault(); if (!name.trim()) return; if (editing) store.updateAttribute(ownerType, owner.id, editing.id, { name: name.trim(), key }); else store.addAttribute(ownerType, owner.id, name.trim(), key); setName(''); setKey(false); setEditing(null) }
  return <div className="form-stack"><div className="attribute-list">{attrs.length === 0 && <p className="empty-note">Todavía no hay atributos.</p>}{attrs.map((a: any) => <div className="attribute-row" key={a.id}><span className={a.key ? 'key-dot filled' : 'key-dot'} /> <span>{a.name}</span>{a.key && <KeyRound size={13} /> }<button onClick={() => { setEditing(a); setName(a.name); setKey(a.key) }} aria-label={`Editar ${a.name}`}><Pencil size={14} /></button><button onClick={() => store.deleteAttribute(ownerType, owner.id, a.id)} aria-label={`Eliminar ${a.name}`}><Trash2 size={14} /></button></div>)}</div><form onSubmit={save} className="attribute-add"><label>{editing ? 'Editar atributo' : 'Nuevo atributo'}<input autoFocus={!editing} value={name} onChange={e => setName(e.target.value)} placeholder="p. ej. nombre" /></label><label className="check-label"><input type="checkbox" checked={key} onChange={e => setKey(e.target.checked)} /> <span className="key-dot filled" /> Es atributo clave</label><div className="form-actions"><button type="button" className="secondary-button" onClick={() => { if (editing) { setEditing(null); setName(''); setKey(false) } else onDone() }}>{editing ? 'Cancelar' : 'Cerrar'}</button><button className="primary-button" disabled={!name.trim()}>{editing ? 'Guardar' : 'Añadir'}</button></div></form></div>
}

function RelationshipFlow({ selectedEntity, entities, store, onDone }: any) {
  const [target, setTarget] = useState<string>('new')
  const [targetName, setTargetName] = useState('')
  const [name, setName] = useState('')
  const [from, setFrom] = useState<Cardinality>({ min: 0, max: 'n' })
  const [to, setTo] = useState<Cardinality>({ min: 0, max: 'n' })
  const otherEntities = entities.filter((entity: any) => entity.id !== selectedEntity?.id)
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!selectedEntity || !name.trim()) return; let targetId = target; if (target === 'new') { if (!targetName.trim()) return; targetId = store.createEntity(targetName.trim()) } const id = store.createRelationship(name.trim(), [{ entityId: selectedEntity.id, cardinality: from }, { entityId: targetId, cardinality: to }]); store.setSelection({ type: 'relationship', id }); onDone() }
  return <form className="form-stack" onSubmit={submit}><p className="flow-intro">Relacionar <strong>{selectedEntity?.name}</strong> con…</p><div className="target-options"><label className="radio-card"><input type="radio" checked={target === 'new'} onChange={() => setTarget('new')} /> <span>Crear nueva entidad</span></label><label className={`radio-card${otherEntities.length ? '' : ' is-disabled'}`}><input type="radio" disabled={!otherEntities.length} checked={target !== 'new'} onChange={e => { if (e.target.checked) setTarget(otherEntities[0]?.id ?? 'new') }} /> <span>Entidad existente</span></label></div>{target === 'new' ? <label>Nombre de la entidad<input autoFocus value={targetName} onChange={e => setTargetName(e.target.value)} placeholder="p. ej. CURSO" /></label> : <label>Entidad destino<select value={target} onChange={e => setTarget(e.target.value)}>{otherEntities.map((entity: any) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>}<label>Nombre de la relación<input value={name} onChange={e => setName(e.target.value)} placeholder="p. ej. INSCRIBE" /></label><div className="cardinality-grid"><CardinalitySelect label={selectedEntity?.name ?? 'Origen'} value={from} onChange={setFrom} /><CardinalitySelect label={target === 'new' ? (targetName || 'Nueva entidad') : otherEntities.find((entity: any) => entity.id === target)?.name} value={to} onChange={setTo} /></div><button className="primary-button" disabled={!name.trim() || (target === 'new' && !targetName.trim())}><Link2 size={17} />Crear relación</button></form>
}

function CardinalitySelect({ label, value, onChange }: { label?: string; value: Cardinality; onChange: (c: Cardinality) => void }) {
  return <label>{label}<select value={cardinalityLabel(value)} onChange={e => { const [min, max] = e.target.value.slice(1, -1).split(','); onChange({ min: Number(min) as 0 | 1, max: max as 1 | 'n' }) }}><option value="(0,1)">(0,1)</option><option value="(1,1)">(1,1)</option><option value="(0,n)">(0,n)</option><option value="(1,n)">(1,n)</option></select></label>
}

function RelationshipEditor({ relationship, store, onDone }: any) {
  const [name, setName] = useState(relationship.name)
  const save = (e: React.FormEvent) => { e.preventDefault(); if (name.trim()) store.renameRelationship(relationship.id, name.trim()); onDone() }
  return <form className="form-stack" onSubmit={save}><label>Nombre de la relación<input autoFocus value={name} onChange={e => setName(e.target.value)} /></label><button className="primary-button" disabled={!name.trim()}><Check size={17} />Guardar cambios</button></form>
}

function CardinalityEditor({ relationship, entities, store, onDone }: any) {
  const [parts, setParts] = useState(relationship.participants.map((p: any) => ({ ...p.cardinality })))
  const save = (e: React.FormEvent) => { e.preventDefault(); relationship.participants.forEach((p: any, i: number) => store.updateParticipant(relationship.id, p.entityId, parts[i])); onDone() }
  return <form className="form-stack" onSubmit={save}>{relationship.participants.map((p: any, i: number) => <CardinalitySelect key={p.entityId} label={entities.find((e: any) => e.id === p.entityId)?.name} value={parts[i]} onChange={c => setParts((old: any[]) => old.map((v, n) => n === i ? c : v))} />)}<button className="primary-button"><Check size={17} />Guardar cardinalidades</button></form>
}

function AppearanceEditor({ view, store, onDone }: any) {
  const [custom, setCustom] = useState<CustomTheme>(view.customTheme ?? { background: '#f7f5ef', entity: '#fffdf8', relationship: '#f0ebe1', ink: '#26231f', font: 'serif' })
  return <div className="appearance-stack"><p className="section-kicker">Estilo del diagrama</p><div className="theme-grid">{([['academic', 'Académico', 'paper'], ['warm', 'Cálido', 'warm'], ['modern', 'Moderno', 'modern']] as const).map(([id, label, klass]) => <button type="button" className={`theme-card ${view.theme === id ? 'selected' : ''}`} key={id} onClick={() => store.setTheme(id)}><span className={`theme-preview ${klass}`}><b /><i /></span><span>{label}</span></button>)}</div><div className="custom-toggle"><span>Colores personalizados</span><small>Opcional</small></div><div className="color-fields">{([['background', 'Fondo'], ['entity', 'Entidad'], ['relationship', 'Relación'], ['ink', 'Tinta']] as const).map(([key, label]) => <label key={key}>{label}<input type="color" value={custom[key]} onChange={e => { const next = { ...custom, [key]: e.target.value }; setCustom(next); store.setTheme('custom'); store.updateCustomTheme(next) }} /></label>)}</div><label className="font-select">Tipografía<select value={custom.font} onChange={e => { const font = e.target.value as 'serif' | 'sans'; const next = { ...custom, font }; setCustom(next); store.setTheme('custom'); store.updateCustomTheme(next) }}><option value="serif">Serif académica</option><option value="sans">Sans moderna</option></select></label><button type="button" className="secondary-button full-button" onClick={onDone}>Listo</button></div>
}

function DiagramMenu({ diagram, store, onClose, onToast }: any) {
  const [name, setName] = useState(diagram.name)
  const rename = (e: React.FormEvent) => { e.preventDefault(); if (name.trim()) store.setDiagramName(name.trim()); onClose() }
  const reset = (mode: 'blank' | 'sample') => { if (window.confirm(mode === 'blank' ? '¿Crear un diagrama vacío? Se reemplazará el contenido actual.' : '¿Restaurar el diagrama de ejemplo?')) { store.resetDiagram(mode); onClose(); onToast('Diagrama actualizado') } }
  return <div className="menu-stack"><form onSubmit={rename} className="form-stack"><label>Nombre del diagrama<input autoFocus value={name} onChange={e => setName(e.target.value)} /></label><button className="primary-button" disabled={!name.trim()}><Check size={17} />Guardar nombre</button></form><div className="menu-divider" /><button className="menu-action" onClick={() => reset('blank')}><Plus size={18} /><span>Nuevo diagrama</span></button><button className="menu-action" onClick={() => reset('sample')}><SquareDashed size={18} /><span>Restaurar ejemplo</span></button></div>
}

function customStyle(theme?: CustomTheme): React.CSSProperties | undefined {
  if (!theme) return undefined
  return { '--custom-bg': theme.background, '--custom-entity': theme.entity, '--custom-relationship': theme.relationship, '--custom-ink': theme.ink, '--custom-font': theme.font === 'serif' ? 'Georgia, serif' : 'Inter, system-ui, sans-serif' } as React.CSSProperties
}

function sheetTitle(sheet: SheetName, entity: any, relationship: any) {
  if (sheet === 'entity') return entity ? 'Editar entidad' : 'Nueva entidad'
  if (sheet === 'attribute') return `Atributos de ${entity?.name ?? relationship?.name ?? ''}`
  if (sheet === 'relationship') return 'Nueva relación'
  if (sheet === 'relationshipEdit') return 'Editar relación'
  if (sheet === 'cardinality') return 'Cardinalidades'
  if (sheet === 'appearance') return 'Apariencia'
  return 'Opciones del diagrama'
}

export default function App() { return <ReactFlowProvider><EditorApp /></ReactFlowProvider> }
