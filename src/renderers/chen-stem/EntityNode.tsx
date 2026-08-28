import { Handle, NodeToolbar, Position, useViewport, type Node, type NodeProps } from '@xyflow/react'
import { Link2, Pencil, Plus, Trash2, Type } from 'lucide-react'
import type { AttributeHandleLayout, DiagramNodeData } from '../types'
import { connectionHandleBox, positionForSide, relationshipHandleId, staticHandleId, STATIC_HANDLE_SIDES } from './handles'

type EntityNodeData = DiagramNodeData & {
  entityKind?: 'strong' | 'weak'
}

/** A deliberately quiet academic entity box. Weak entities use two outlines. */
type EntityNodeType = Node<EntityNodeData, 'entity'>

function styleForHandle(handle: AttributeHandleLayout): React.CSSProperties {
  return { left: handle.x, top: handle.y }
}

export function EntityNode({ data, selected }: NodeProps<EntityNodeType>) {
  const { zoom } = useViewport()
  const isWeak = data.entityKind === 'weak'
  const width = data.width ?? 192
  const height = data.height ?? 96
  const attributeHandles = (data.attributeHandles ?? []) as AttributeHandleLayout[]
  const actions = data.actions
  const isSelected = Boolean(selected || data.selected)
  const connectionHandleSize = 44 / Math.max(zoom, 0.05)
  const markerSize = 8 / Math.max(zoom, 0.05)
  const targetHandlePosition = (side: 'north' | 'east' | 'south' | 'west') =>
    connectionHandleBox(side, width, height, connectionHandleSize)
  const relationshipHandlePosition = (side: 'north' | 'east' | 'south' | 'west') => ({
    left: side === 'east' ? width : side === 'west' ? 0 : width / 2,
    top: side === 'south' ? height : side === 'north' ? 0 : height / 2,
    width: connectionHandleSize,
    height: connectionHandleSize,
  })
  const invoke = (action?: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation()
    action?.()
  }

  return (
    <div
      className={`chen-node chen-entity-node${isWeak ? ' chen-entity-node--weak' : ''}${isSelected ? ' is-selected' : ''}${data.hovered ? ' is-hovered' : ''}`}
      aria-label={`Entidad ${data.label}`}
      style={{ width, height }}
    >
      <NodeToolbar className="chen-node-toolbar" isVisible={isSelected} position={Position.Top} offset={14}>
        <button className="nodrag nopan" onClick={invoke(actions?.addAttribute)} title="Añadir atributo (A)" aria-label="Añadir atributo"><Type size={14} /><span>Atributo</span></button>
        <button className="nodrag nopan" onClick={invoke(actions?.createRelationship)} title="Crear relación (R)" aria-label="Crear relación"><Link2 size={14} /><span>Relación</span></button>
        <button className="nodrag nopan" onClick={invoke(actions?.rename)} title="Renombrar (Enter)" aria-label="Renombrar"><Pencil size={14} /><span>Renombrar</span></button>
        <button className="nodrag nopan is-danger" onClick={invoke(actions?.delete)} title="Eliminar (Delete)" aria-label="Eliminar"><Trash2 size={14} /><span>Eliminar</span></button>
      </NodeToolbar>
      <NodeToolbar className={`chen-hover-actions${data.hovered && !isSelected ? ' is-visible' : ''}`} isVisible={Boolean(data.hovered && !isSelected)} position={Position.Top} offset={14}>
        <button className="nodrag nopan" onClick={invoke(actions?.addAttribute)} title="Añadir atributo (A)" aria-label="Añadir atributo"><Plus size={13} /></button>
        <button className="nodrag nopan" onClick={invoke(actions?.createRelationship)} title="Crear relación (R)" aria-label="Crear relación"><Link2 size={13} /></button>
      </NodeToolbar>
      {isWeak && <span className="chen-entity-node__inner" aria-hidden="true" />}
      <span className="chen-node__label">{data.label || 'Sin nombre'}</span>
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('north')} id={staticHandleId('source', 'north')} style={{ left: width / 2, top: 0 }} />
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('east')} id={staticHandleId('source', 'east')} style={{ left: width, top: height / 2 }} />
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('south')} id={staticHandleId('source', 'south')} style={{ left: width / 2, top: height }} />
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('west')} id={staticHandleId('source', 'west')} style={{ left: 0, top: height / 2 }} />
      {STATIC_HANDLE_SIDES.map((side) => (
        <Handle
          key={`target-${side}`}
          className="chen-hidden-handle chen-target-handle"
          type="target"
          position={positionForSide(side)}
          id={staticHandleId('target', side)}
          isConnectableStart={false}
          style={targetHandlePosition(side)}
        />
      ))}
      {STATIC_HANDLE_SIDES.map((side) => (
        <Handle
          key={`relationship-${side}`}
          className="chen-relationship-handle nodrag nopan"
          type="source"
          position={positionForSide(side)}
          id={relationshipHandleId(side)}
          isConnectableStart={isSelected || Boolean(data.hovered)}
          style={relationshipHandlePosition(side)}
          aria-label={`Crear relación desde el lado ${side}`}
          title="Arrastrar para crear relación"
        >
          <span aria-hidden="true" style={{ width: markerSize, height: markerSize }} />
        </Handle>
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
