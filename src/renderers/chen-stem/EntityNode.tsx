import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { DiagramNodeData } from '../types'

type EntityNodeData = DiagramNodeData & {
  entityKind?: 'strong' | 'weak'
}

/** A deliberately quiet academic entity box. Weak entities use two outlines. */
type EntityNodeType = Node<EntityNodeData, 'entity'>

export function EntityNode({ data, selected }: NodeProps<EntityNodeType>) {
  const isWeak = data.entityKind === 'weak'

  return (
    <div
      className={`chen-node chen-entity-node${isWeak ? ' chen-entity-node--weak' : ''}${selected || data.selected ? ' is-selected' : ''}`}
      aria-label={`Entidad ${data.label}`}
    >
      {isWeak && <span className="chen-entity-node__inner" aria-hidden="true" />}
      <span className="chen-node__label">{data.label || 'Sin nombre'}</span>
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
