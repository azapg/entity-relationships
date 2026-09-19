import { Handle, NodeToolbar, Position, type Node, type NodeProps } from '@xyflow/react'
import { Pencil, Trash2 } from 'lucide-react'
import type { DiagramNodeData } from '../types'
import { positionForSide, staticHandleId, STATIC_HANDLE_SIDES } from './handles'
import { GENERALIZATION_SIZE } from './renderDiagram'

type GeneralizationNodeType = Node<DiagramNodeData, 'generalization'>

export function GeneralizationNode({ data, selected }: NodeProps<GeneralizationNodeType>) {
  const width = data.width ?? GENERALIZATION_SIZE.width
  const height = data.height ?? GENERALIZATION_SIZE.height
  const actions = data.actions
  const isSelected = Boolean(selected || data.selected)
  const invoke = (action?: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation()
    action?.()
  }

  return <div
    className={`chen-node chen-generalization-node${isSelected ? ' is-selected' : ''}${data.hovered ? ' is-hovered' : ''}`}
    aria-label={`Generalización ${String(data.coverageDescription ?? data.label)}`}
    title={String(data.coverageDescription ?? data.label)}
    style={{ width, height }}
  >
    <NodeToolbar className="chen-node-toolbar" isVisible={isSelected} position={Position.Right} offset={10}>
      <button className="nodrag nopan" onClick={invoke(actions?.editGeneralization)} title="Editar cobertura" aria-label="Editar generalización"><Pencil size={14} /><span>Editar</span></button>
      <button className="nodrag nopan is-danger" onClick={invoke(actions?.delete)} title="Eliminar (Delete)" aria-label="Eliminar generalización"><Trash2 size={14} /><span>Eliminar</span></button>
    </NodeToolbar>
    <span className="chen-generalization-node__label">{data.label}</span>
    {STATIC_HANDLE_SIDES.map((side) => <Handle
      key={`source-${side}`}
      className="chen-hidden-handle"
      type="source"
      position={positionForSide(side)}
      id={staticHandleId('source', side)}
      style={{
        left: side === 'east' ? width : side === 'west' ? 0 : width / 2,
        top: side === 'south' ? height : side === 'north' ? 0 : height / 2,
      }}
    />)}
    {STATIC_HANDLE_SIDES.map((side) => <Handle
      key={`target-${side}`}
      className="chen-hidden-handle"
      type="target"
      position={positionForSide(side)}
      id={staticHandleId('target', side)}
      style={{
        left: side === 'east' ? width : side === 'west' ? 0 : width / 2,
        top: side === 'south' ? height : side === 'north' ? 0 : height / 2,
      }}
    />)}
  </div>
}
