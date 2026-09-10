import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { DiagramNodeData } from '../types'

type TableData = DiagramNodeData & {
  columns?: Array<{ id: string; name: string; primaryKey?: boolean; unique?: boolean; foreignKey?: boolean }>
}
type TableNodeType = Node<TableData, 'table'>

export function TableNode({ data, selected }: NodeProps<TableNodeType>) {
  const columns = data.columns ?? []
  const names = new Map(columns.map((column) => [column.id, column.name]))
  const constraints = (data.uniqueConstraints ?? []).filter((key) => key.length > 1 && !key.every((id) => columns.find((column) => column.id === id)?.primaryKey))
  return <div className={`relational-table${selected || data.selected ? ' is-selected' : ''}${data.generated ? ' is-generated' : ''}`} aria-label={`Tabla ${data.label}`}>
    <div className="relational-table__title" style={{ minHeight: data.titleHeight }} title={data.label || 'Sin nombre'}>{data.label || 'Sin nombre'}</div>
    <div className="relational-table__columns">
      {columns.length ? columns.map((column) => <div className="relational-table__row" style={{ minHeight: data.rowHeights?.[column.id] }} key={column.id} aria-label={`${column.name}${column.primaryKey ? ', clave primaria' : ''}${column.foreignKey ? ', clave foránea' : ''}`}>
        <Handle className="relational-table__handle" type="target" position={Position.Left} id={`target:${column.id}`} isConnectable={false} />
        <span className={`relational-table__key${column.primaryKey ? ' is-primary' : ''}`}>{column.primaryKey && column.foreignKey ? 'PK/FK' : column.primaryKey ? 'PK' : column.foreignKey ? 'FK' : ''}</span>
        <span className="relational-table__name" title={column.name}>{column.name}</span>
        {column.unique && !column.primaryKey && <span className="relational-table__unique" title="UNIQUE">UNIQUE</span>}
        <Handle className="relational-table__handle" type="source" position={Position.Right} id={`source:${column.id}`} isConnectable={false} />
      </div>) : <div className="relational-table__empty">Sin columnas</div>}
      {constraints.map((key) => <div className="relational-table__constraint" style={{ minHeight: data.constraintHeights?.[key.join(',')] }} key={key.join(',')}>UNIQUE ({key.map((id) => names.get(id) ?? id).join(', ')})</div>)}
    </div>
  </div>
}
