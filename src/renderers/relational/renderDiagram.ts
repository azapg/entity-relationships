import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { Diagram, Point } from '../../domain/types'
import type { DiagramNodeData, RenderedDiagram } from '../types'
import { projectRelationalSchema } from '../../domain/relational'

const ROW_HEIGHT = 30
const TITLE_HEIGHT = 38
const TABLE_WIDTH = 240
const GAP_X = 96
const GAP_Y = 72
const lines = (text: string, capacity: number) => Math.max(1, Math.ceil(Array.from(text).length / capacity))
const tableMetrics = (table: { name: string; columns: Array<{ id: string; name: string; primaryKey: boolean }>; uniqueKeys: string[][] }) => {
  const titleHeight = Math.max(TITLE_HEIGHT, lines(table.name || 'Sin nombre', 18) * 18 + 18)
  const rowHeights = Object.fromEntries(table.columns.map((column) => [column.id, Math.max(ROW_HEIGHT, lines(column.name, 24) * 18 + 10)]))
  const names = new Map(table.columns.map((column) => [column.id, column.name]))
  const constraintHeights = Object.fromEntries(table.uniqueKeys.filter((key) => key.length > 1 && !key.every((id) => table.columns.find((column) => column.id === id)?.primaryKey)).map((key) => [key.join(','), Math.max(24, lines(`UNIQUE (${key.map((id) => names.get(id) ?? id).join(', ')})`, 31) * 16 + 8)]))
  const height = titleHeight + Math.max(1, table.columns.length) * ROW_HEIGHT + Object.values(rowHeights).reduce((sum, value) => sum + value - ROW_HEIGHT, 0) + Object.values(constraintHeights).reduce((sum, value) => sum + value, 0)
  return { titleHeight, rowHeights, constraintHeights, height }
}

const tablePosition = (index: number, positions: Record<string, Point>, id: string, rowOffset: number): Point =>
  positions[id] ?? { x: 96 + (index % 3) * (TABLE_WIDTH + GAP_X), y: rowOffset }

export function renderRelationalDiagram(diagram: Diagram, selectedId?: string): RenderedDiagram {
  const schema = projectRelationalSchema(diagram)
  const positions = ((diagram.view as Diagram['view'] & { relationalPositions?: Record<string, Point> }).relationalPositions ?? {})
  const metrics = schema.tables.map(tableMetrics)
  const rowHeights = Array.from({ length: Math.ceil(schema.tables.length / 3) }, (_, row) => Math.max(...schema.tables.slice(row * 3, row * 3 + 3).map((_, index) => metrics[row * 3 + index].height + GAP_Y), 220))
  const nodes: Node<DiagramNodeData>[] = schema.tables.map((table, index) => {
    const columns = table.columns.map((column) => ({
      id: column.id,
      name: column.name,
      primaryKey: column.primaryKey,
      unique: table.uniqueKeys.some((key) => key.length === 1 && key[0] === column.id),
      foreignKey: schema.foreignKeys.some((foreignKey) => foreignKey.tableId === table.id && foreignKey.columnIds.includes(column.id)),
    }))
    const metric = metrics[index]
    const position = tablePosition(index, positions, table.id, rowHeights.slice(0, Math.floor(index / 3)).reduce((sum, height) => sum + height, 72))
    return {
      id: `table:${table.id}`,
      type: 'table',
      position,
      width: TABLE_WIDTH,
      height: metric.height,
      draggable: true,
      data: {
        semanticId: table.source.type === 'entity' ? table.source.id : table.id,
        kind: 'table',
        label: table.name,
        selected: table.source.type === 'entity' && selectedId === table.source.id,
        columns,
        generated: table.source.type === 'relationship',
        tableId: table.id,
        uniqueConstraints: table.uniqueKeys,
        titleHeight: metric.titleHeight,
        rowHeights: metric.rowHeights,
        constraintHeights: metric.constraintHeights,
        width: TABLE_WIDTH,
        height: metric.height,
      },
    }
  })
  const edges: Edge[] = schema.foreignKeys.flatMap((foreignKey) => {
    return foreignKey.columnIds.map((columnId, index) => ({
      id: `foreign-key:${foreignKey.id}:${index}`,
      type: 'relationalForeignKey',
      source: `table:${foreignKey.tableId}`,
      target: `table:${foreignKey.referencedTableId}`,
      sourceHandle: `source:${columnId}`,
      targetHandle: `target:${foreignKey.referencedColumnIds[index]}`,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { sourceColumnId: columnId, targetColumnId: foreignKey.referencedColumnIds[index] },
    }))
  }).flat()
  return { nodes, edges }
}

export const relationalTableSize = (columnCount: number) => ({ width: TABLE_WIDTH, height: TITLE_HEIGHT + Math.max(1, columnCount) * ROW_HEIGHT })
