import { Handle, type Node, type NodeProps } from '@xyflow/react'
import type { AttributeHandleLayout, DiagramNodeData } from '../types'
import { positionForSide, staticHandleId } from './handles'

/** The SVG fills the measured node box, keeping handles on the visible tips. */
type RelationshipNodeType = Node<DiagramNodeData, 'relationship'>

const styleForHandle = (handle: AttributeHandleLayout): React.CSSProperties => ({
  left: handle.x,
  top: handle.y,
})

export function RelationshipNode({ data, selected }: NodeProps<RelationshipNodeType>) {
  const width = data.width ?? 96
  const height = data.height ?? 96
  const attributeHandles = (data.attributeHandles ?? []) as AttributeHandleLayout[]
  return (
    <div
      className={`chen-node chen-relationship-node${selected || data.selected ? ' is-selected' : ''}`}
      aria-label={`Relación ${data.label}`}
      style={{ width, height }}
    >
      <svg className="chen-relationship-node__diamond" viewBox="0 0 96 96" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="48,1 95,48 48,95 1,48" />
      </svg>
      <span className="chen-relationship-node__label">{data.label || 'Sin nombre'}</span>
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('north')} id={staticHandleId('source', 'north')} style={{ left: width / 2, top: 1 }} />
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('east')} id={staticHandleId('source', 'east')} style={{ left: width - 1, top: height / 2 }} />
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('south')} id={staticHandleId('source', 'south')} style={{ left: width / 2, top: height - 1 }} />
      <Handle className="chen-hidden-handle" type="source" position={positionForSide('west')} id={staticHandleId('source', 'west')} style={{ left: 1, top: height / 2 }} />
      <Handle className="chen-hidden-handle" type="target" position={positionForSide('north')} id={staticHandleId('target', 'north')} style={{ left: width / 2, top: 1 }} />
      <Handle className="chen-hidden-handle" type="target" position={positionForSide('east')} id={staticHandleId('target', 'east')} style={{ left: width - 1, top: height / 2 }} />
      <Handle className="chen-hidden-handle" type="target" position={positionForSide('south')} id={staticHandleId('target', 'south')} style={{ left: width / 2, top: height - 1 }} />
      <Handle className="chen-hidden-handle" type="target" position={positionForSide('west')} id={staticHandleId('target', 'west')} style={{ left: 1, top: height / 2 }} />
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
