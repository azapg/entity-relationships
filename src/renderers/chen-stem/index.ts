import './chen.css'
import { EntityNode } from './EntityNode'
import { RelationshipNode } from './RelationshipNode'
import { AttributeNode } from './AttributeNode'
import { ConnectorEdge } from './ConnectorEdge'
import { renderDiagram } from './renderDiagram'

export { EntityNode, RelationshipNode, AttributeNode, ConnectorEdge, renderDiagram }
export const nodeTypes = {
  entity: EntityNode,
  relationship: RelationshipNode,
  attribute: AttributeNode,
}
export const edgeTypes = { connector: ConnectorEdge }

