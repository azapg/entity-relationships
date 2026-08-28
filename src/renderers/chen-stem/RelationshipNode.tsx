import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { DiagramNodeData } from '../types'

/** A diamond is kept as CSS geometry so it scales with the renderer theme. */
type RelationshipNodeType = Node<DiagramNodeData, 'relationship'>

export function RelationshipNode({ data, selected }: NodeProps<RelationshipNodeType>) {
  return (
    <div
      className={`chen-node chen-relationship-node${selected || data.selected ? ' is-selected' : ''}`}
      aria-label={`Relación ${data.label}`}
    >
      <span className="chen-relationship-node__diamond" aria-hidden="true" />
      <span className="chen-relationship-node__label">{data.label || 'Sin nombre'}</span>
      <Handle className="chen-hidden-handle" type="source" position={Position.Top} id="source-top" />
      <Handle className="chen-hidden-handle" type="source" position={Position.Right} id="source-right" />
      <Handle className="chen-hidden-handle" type="source" position={Position.Bottom} id="source-bottom" />
      <Handle className="chen-hidden-handle" type="source" position={Position.Left} id="source-left" />
      <Handle className="chen-hidden-handle" type="target" position={Position.Top} id="target-top" />
      <Handle className="chen-hidden-handle" type="target" position={Position.Right} id="target-right" />
      <Handle className="chen-hidden-handle" type="target" position={Position.Bottom} id="target-bottom" />
      <Handle className="chen-hidden-handle" type="target" position={Position.Left} id="target-left" />
    </div>
  )
}
