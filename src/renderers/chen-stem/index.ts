import './chen.css'
import { EntityNode } from './EntityNode'
import { RelationshipNode } from './RelationshipNode'
import { AttributeNode } from './AttributeNode'
import { GeneralizationNode } from './GeneralizationNode'
import { ConnectorEdge } from './ConnectorEdge'
import { renderDiagram } from './renderDiagram'

export { EntityNode, RelationshipNode, GeneralizationNode, AttributeNode, ConnectorEdge, renderDiagram }
export const nodeTypes = {
  entity: EntityNode,
  relationship: RelationshipNode,
  generalization: GeneralizationNode,
  attribute: AttributeNode,
}
export const edgeTypes = { connector: ConnectorEdge }
