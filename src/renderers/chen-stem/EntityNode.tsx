import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { AttributeHandleLayout, AttributeSide, DiagramNodeData } from '../types'

type EntityNodeData = DiagramNodeData & {
  entityKind?: 'strong' | 'weak'
}

/** A deliberately quiet academic entity box. Weak entities use two outlines. */
type EntityNodeType = Node<EntityNodeData, 'entity'>

const positionForSide = (side: AttributeSide) => ({
  north: Position.Top,
  east: Position.Right,
  south: Position.Bottom,
  west: Position.Left,
}[side])

function styleForHandle(handle: AttributeHandleLayout): React.CSSProperties {
  return { left: handle.x, top: handle.y }
}

export function EntityNode({ data, selected }: NodeProps<EntityNodeType>) {
  const isWeak = data.entityKind === 'weak'
  const width = data.width ?? 192
  const height = data.height ?? 96
  const attributeHandles = (data.attributeHandles ?? []) as AttributeHandleLayout[]

  return (
    <div
      className={`chen-node chen-entity-node${isWeak ? ' chen-entity-node--weak' : ''}${selected || data.selected ? ' is-selected' : ''}`}
      aria-label={`Entidad ${data.label}`}
      style={{ width, height }}
    >
      {isWeak && <span className="chen-entity-node__inner" aria-hidden="true" />}
      <span className="chen-node__label">{data.label || 'Sin nombre'}</span>
      <Handle className="chen-hidden-handle" type="source" position={Position.Top} id="source-top" style={{ left: width / 2, top: 0 }} />
      <Handle className="chen-hidden-handle" type="source" position={Position.Right} id="source-right" style={{ left: width, top: height / 2 }} />
      <Handle className="chen-hidden-handle" type="source" position={Position.Bottom} id="source-bottom" style={{ left: width / 2, top: height }} />
      <Handle className="chen-hidden-handle" type="source" position={Position.Left} id="source-left" style={{ left: 0, top: height / 2 }} />
      <Handle className="chen-hidden-handle" type="target" position={Position.Top} id="target-top" style={{ left: width / 2, top: 0 }} />
      <Handle className="chen-hidden-handle" type="target" position={Position.Right} id="target-right" style={{ left: width, top: height / 2 }} />
      <Handle className="chen-hidden-handle" type="target" position={Position.Bottom} id="target-bottom" style={{ left: width / 2, top: height }} />
      <Handle className="chen-hidden-handle" type="target" position={Position.Left} id="target-left" style={{ left: 0, top: height / 2 }} />
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
