import { Handle, type Node, type NodeProps } from '@xyflow/react'
import type { AttributeHandleLayout, DiagramNodeData } from '../types'
import { positionForSide, staticHandleId } from './handles'

type EntityNodeData = DiagramNodeData & {
  entityKind?: 'strong' | 'weak'
}

/** A deliberately quiet academic entity box. Weak entities use two outlines. */
type EntityNodeType = Node<EntityNodeData, 'entity'>

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
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('north')} id={staticHandleId('source', 'north')} style={{ left: width / 2, top: 0 }} />
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('east')} id={staticHandleId('source', 'east')} style={{ left: width, top: height / 2 }} />
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('south')} id={staticHandleId('source', 'south')} style={{ left: width / 2, top: height }} />
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('west')} id={staticHandleId('source', 'west')} style={{ left: 0, top: height / 2 }} />
      <Handle className="chen-hidden-handle" type="target" position={positionForSide('north')} id={staticHandleId('target', 'north')} style={{ left: width / 2, top: 0 }} />
      <Handle className="chen-hidden-handle" type="target" position={positionForSide('east')} id={staticHandleId('target', 'east')} style={{ left: width, top: height / 2 }} />
      <Handle className="chen-hidden-handle" type="target" position={positionForSide('south')} id={staticHandleId('target', 'south')} style={{ left: width / 2, top: height }} />
      <Handle className="chen-hidden-handle" type="target" position={positionForSide('west')} id={staticHandleId('target', 'west')} style={{ left: 0, top: height / 2 }} />
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
