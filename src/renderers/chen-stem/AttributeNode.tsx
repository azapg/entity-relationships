import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { DiagramNodeData } from '../types'

type AttributeNodeData = DiagramNodeData & {
  key?: boolean
  lane?: 'north' | 'east' | 'south' | 'west'
}

/** The terminal handle is laid over the visual marker so stems have no gap. */
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
      <Handle
        className={`chen-hidden-handle chen-terminal-handle chen-terminal-handle--${lane}`}
        type="target"
        position={lane === 'north' ? Position.Bottom : lane === 'east' ? Position.Left : lane === 'south' ? Position.Top : Position.Right}
        id="target-terminal"
      />
    </div>
  )
}
