import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { DiagramNodeData } from '../types'

type AttributeNodeData = DiagramNodeData & {
  key?: boolean
  lane?: 'north' | 'east' | 'south' | 'west'
}

/** Attributes are intentionally not handles: their terminal is visual only. */
type AttributeNodeType = Node<AttributeNodeData, 'attribute'>

export function AttributeNode({ data, selected }: NodeProps<AttributeNodeType>) {
  const lane = data.lane ?? 'east'
  return (
    <div
      className={`chen-node chen-attribute-node chen-attribute-node--${lane}${selected || data.selected ? ' is-selected' : ''}`}
      aria-label={`Atributo ${data.label}`}
    >
      <span className={`chen-attribute-node__terminal${data.key ? ' is-key' : ''}`} aria-hidden="true" />
      <span className={`chen-node__label${data.key ? ' is-key' : ''}`}>{data.label || 'Sin nombre'}</span>
      <Handle className="chen-hidden-handle" type="target" position={Position.Top} id="target-top" />
      <Handle className="chen-hidden-handle" type="target" position={Position.Right} id="target-right" />
      <Handle className="chen-hidden-handle" type="target" position={Position.Bottom} id="target-bottom" />
      <Handle className="chen-hidden-handle" type="target" position={Position.Left} id="target-left" />
    </div>
  )
}
