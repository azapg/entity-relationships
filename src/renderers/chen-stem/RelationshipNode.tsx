import { useLayoutEffect, useRef, useState } from 'react'
import { Handle, NodeToolbar, Position, useViewport, type Node, type NodeProps } from '@xyflow/react'
import { Pencil, Plus, SlidersHorizontal, Trash2, Type } from 'lucide-react'
import type { AttributeHandleLayout, DiagramNodeData } from '../types'
import { connectionHandleBox, positionForSide, staticHandleId, STATIC_HANDLE_SIDES } from './handles'
import { DIAMOND_INSET, RELATION_SIZE } from './renderDiagram'

/** The SVG fills the measured node box, keeping handles on the visible tips. */
type RelationshipNodeType = Node<DiagramNodeData, 'relationship'>

const styleForHandle = (handle: AttributeHandleLayout): React.CSSProperties => ({
  left: handle.x,
  top: handle.y,
})

// The horizontal diagonal is the diamond's longest usable axis. Keep a small
// margin for the stroke while letting long labels shrink into that space.
const RELATIONSHIP_LABEL_INSET = 0.84

export function RelationshipNode({ data, selected }: NodeProps<RelationshipNodeType>) {
  const { zoom } = useViewport()
  const width = data.width ?? RELATION_SIZE.width
  const height = data.height ?? RELATION_SIZE.height
  const label = data.label || 'Sin nombre'
  const labelRef = useRef<HTMLSpanElement>(null)
  const [labelScale, setLabelScale] = useState(1)
  const attributeHandles = (data.attributeHandles ?? []) as AttributeHandleLayout[]
  const actions = data.actions
  const isSelected = Boolean(selected || data.selected)
  const connectionHandleSize = 44 / Math.max(zoom, 0.05)

  useLayoutEffect(() => {
    const element = labelRef.current
    if (!element) return
    let disposed = false
    const fit = () => {
      const naturalWidth = element.scrollWidth
      const availableWidth = Math.max(24, Math.min(width, height) * RELATIONSHIP_LABEL_INSET)
      const nextScale = naturalWidth > 0 ? Math.min(1, availableWidth / naturalWidth) : 1
      if (!disposed) setLabelScale((current) => Math.abs(current - nextScale) < 0.01 ? current : nextScale)
    }
    fit()
    const fontsReady = document.fonts?.ready
    fontsReady?.then(() => { if (!disposed) fit() })
    return () => { disposed = true }
  }, [height, label, width])

  const invoke = (action?: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation()
    action?.()
  }
  return (
    <div
      className={`chen-node chen-relationship-node${isSelected ? ' is-selected' : ''}${data.hovered ? ' is-hovered' : ''}`}
      aria-label={`Relación ${data.label}`}
      style={{ width, height }}
    >
      <NodeToolbar className="chen-node-toolbar" isVisible={isSelected} position={Position.Top} offset={14}>
        <button className="nodrag nopan" onClick={invoke(actions?.addAttribute)} title="Añadir atributo (A)" aria-label="Añadir atributo"><Type size={14} /><span>Atributo</span></button>
        <button className="nodrag nopan" onClick={invoke(actions?.editCardinality)} title="Editar cardinalidad" aria-label="Editar cardinalidad"><SlidersHorizontal size={14} /><span>Cardinalidad</span></button>
        <button className="nodrag nopan" onClick={invoke(actions?.rename)} title="Renombrar (Enter)" aria-label="Renombrar"><Pencil size={14} /><span>Renombrar</span></button>
        <button className="nodrag nopan is-danger" onClick={invoke(actions?.delete)} title="Eliminar (Delete)" aria-label="Eliminar"><Trash2 size={14} /><span>Eliminar</span></button>
      </NodeToolbar>
      <NodeToolbar className={`chen-hover-actions${data.hovered && !isSelected ? ' is-visible' : ''}`} isVisible={Boolean(data.hovered && !isSelected)} position={Position.Top} offset={14}>
        <button className="nodrag nopan" onClick={invoke(actions?.addAttribute)} title="Añadir atributo (A)" aria-label="Añadir atributo"><Plus size={13} /></button>
      </NodeToolbar>
      <svg className="chen-relationship-node__diamond" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <polygon points={`${width / 2},${DIAMOND_INSET} ${width - DIAMOND_INSET},${height / 2} ${width / 2},${height - DIAMOND_INSET} ${DIAMOND_INSET},${height / 2}`} />
      </svg>
      <span
        ref={labelRef}
        className="chen-relationship-node__label"
        style={{ transform: `scale(${labelScale})` }}
      >{label}</span>
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('north')} id={staticHandleId('source', 'north')} style={{ left: width / 2, top: DIAMOND_INSET }} />
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('east')} id={staticHandleId('source', 'east')} style={{ left: width - DIAMOND_INSET, top: height / 2 }} />
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('south')} id={staticHandleId('source', 'south')} style={{ left: width / 2, top: height - DIAMOND_INSET }} />
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('west')} id={staticHandleId('source', 'west')} style={{ left: DIAMOND_INSET, top: height / 2 }} />
      {STATIC_HANDLE_SIDES.map((side) => (
        <Handle
          key={`target-${side}`}
          className="chen-hidden-handle chen-target-handle"
          type="target"
          position={positionForSide(side)}
          id={staticHandleId('target', side)}
          isConnectableStart={false}
          style={connectionHandleBox(side, width, height, connectionHandleSize, DIAMOND_INSET)}
        />
      ))}
      {attributeHandles.map((handle) => (
        <Handle
          key={handle.id}
          className="chen-hidden-handle chen-owner-handle"
          type="source"
          position={positionForSide(handle.side)}
          id={`source-${handle.side}-${handle.id}`}
          style={styleForHandle(handle)}
        />
      ))}
    </div>
  )
}
