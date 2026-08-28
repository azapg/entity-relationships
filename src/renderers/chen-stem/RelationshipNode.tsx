import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { DiagramNodeData } from '../types'

/** The SVG fills the measured node box, keeping handles on the visible tips. */
type RelationshipNodeType = Node<DiagramNodeData, 'relationship'>

export function RelationshipNode({ data, selected }: NodeProps<RelationshipNodeType>) {
  return (
    <div
      className={`chen-node chen-relationship-node${selected || data.selected ? ' is-selected' : ''}`}
      aria-label={`Relación ${data.label}`}
    >
      <svg className="chen-relationship-node__diamond" viewBox="0 0 132 92" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="66,0.8 131.2,46 66,91.2 0.8,46" />
      </svg>
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
