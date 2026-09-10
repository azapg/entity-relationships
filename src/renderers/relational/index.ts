import './relational.css'
import { renderRelationalDiagram } from './renderDiagram'
import { TableNode } from './TableNode'
import { ForeignKeyEdge } from './ForeignKeyEdge'

export { renderRelationalDiagram, TableNode, ForeignKeyEdge }
export const nodeTypes = { table: TableNode }
export const edgeTypes = { relationalForeignKey: ForeignKeyEdge }
