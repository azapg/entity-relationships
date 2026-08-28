import type { Edge, Node } from '@xyflow/react'
import type { Attribute, Diagram, Point } from '../../domain/types'
import type { DiagramNodeData, RenderedDiagram } from '../types'

const ENTITY_SIZE = { width: 170, height: 92 }
const RELATION_SIZE = { width: 132, height: 82 }
const ATTRIBUTE_SIZE = { width: 160, height: 38 }
// Prefer vertical lanes first so a small academic diagram remains readable on
// a phone; later attributes still fan out to the east and west.
const LANES = ['north', 'south', 'east', 'west'] as const
type Lane = (typeof LANES)[number]
type Side = 'top' | 'right' | 'bottom' | 'left'

type Owner = {
  kind: 'entity' | 'relationship'
  id: string
  position: Point
  width: number
  height: number
  attributes: Attribute[]
}

const nodeId = (kind: string, id: string) => `${kind}:${id}`
const attrNodeId = (kind: Owner['kind'], ownerId: string, attributeId: string) =>
  `attribute:${kind}:${ownerId}:${attributeId}`

function sideFor(from: Point, to: Point): Side {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function opposite(side: Side): Side {
  return side === 'top' ? 'bottom' : side === 'right' ? 'left' : side === 'bottom' ? 'top' : 'right'
}

function selectedFor(selectedId: string | undefined, id: string) {
  return selectedId === id || selectedId === nodeId('entity', id) || selectedId === nodeId('relationship', id)
}

function attributePosition(owner: Owner, lane: Lane, laneOffset: number): Point {
  const x = owner.position.x
  const y = owner.position.y
  const offset = laneOffset * 52
  const centerX = x + owner.width / 2
  const centerY = y + owner.height / 2
  switch (lane) {
    case 'north': return { x: centerX + offset - ATTRIBUTE_SIZE.width / 2, y: y - 74 }
    case 'east': return { x: x + owner.width + 90, y: centerY + offset - ATTRIBUTE_SIZE.height / 2 }
    case 'south': return { x: centerX + offset - ATTRIBUTE_SIZE.width / 2, y: y + owner.height + 62 }
    case 'west': return { x: x - ATTRIBUTE_SIZE.width - 90, y: centerY + offset - ATTRIBUTE_SIZE.height / 2 }
  }
}

function ownerAttributes(owner: Owner, selectedId: string | undefined, nodes: Node<DiagramNodeData>[], edges: Edge[]) {
  owner.attributes.forEach((attribute, index) => {
    const lane = LANES[index % LANES.length]
    const laneOffset = Math.floor(index / LANES.length)
    const id = attrNodeId(owner.kind, owner.id, attribute.id)
    const semanticOwnerId = nodeId(owner.kind, owner.id)
    nodes.push({
      id,
      type: 'attribute',
      position: attributePosition(owner, lane, laneOffset),
      draggable: false,
      selectable: false,
      data: {
        semanticId: attribute.id,
        kind: 'attribute',
        label: attribute.name,
        selected: false,
        key: attribute.key,
        ownerId: owner.id,
        ownerKind: owner.kind,
        ownerType: owner.kind,
        lane,
      },
    })
    edges.push({
      id: `attribute-edge:${owner.kind}:${owner.id}:${attribute.id}`,
      type: 'connector',
      source: semanticOwnerId,
      target: id,
      sourceHandle: `source-${sideFor(owner.position, attributePosition(owner, lane, laneOffset))}`,
      targetHandle: `target-${opposite(sideFor(owner.position, attributePosition(owner, lane, laneOffset)))}`,
      selectable: false,
        data: { connectorKind: 'attribute', lane, sourceKind: owner.kind, selected: selectedFor(selectedId, owner.id) },
    })
  })
}

/** Projects semantic model data into React Flow's deliberately disposable graph. */
export function renderDiagram(diagram: Diagram, selectedId?: string): RenderedDiagram {
  const nodes: Node<DiagramNodeData>[] = []
  const edges: Edge[] = []
  const positions = diagram.view?.positions ?? {}
  const entityPositions = new Map<string, Point>()
  const relationshipPositions = new Map<string, Point>()

  diagram.entities.forEach((entity, entityIndex) => {
    const position = positions[entity.id] ?? { x: 120 + entityIndex * 230, y: 150 }
    entityPositions.set(entity.id, position)
    nodes.push({
      id: nodeId('entity', entity.id),
      type: 'entity',
      position,
      draggable: true,
      data: {
        semanticId: entity.id,
        kind: 'entity',
        label: entity.name,
        selected: selectedFor(selectedId, entity.id),
        entityKind: entity.kind,
        kindType: entity.kind,
      },
    })
  })

  diagram.relationships.forEach((relationship, relationshipIndex) => {
    const position = positions[relationship.id] ?? { x: 260 + relationshipIndex * 220, y: 340 }
    relationshipPositions.set(relationship.id, position)
    nodes.push({
      id: nodeId('relationship', relationship.id),
      type: 'relationship',
      position,
      draggable: true,
      data: {
        semanticId: relationship.id,
        kind: 'relationship',
        label: relationship.name,
        selected: selectedFor(selectedId, relationship.id),
      },
    })
  })

  const byId = new Map(diagram.entities.map((entity) => [entity.id, entity]))
  diagram.entities.forEach((entity) => {
    ownerAttributes({
      kind: 'entity', id: entity.id, position: entityPositions.get(entity.id)!,
      width: ENTITY_SIZE.width, height: ENTITY_SIZE.height, attributes: entity.attributes,
    }, selectedId, nodes, edges)
  })

  diagram.relationships.forEach((relationship) => {
    ownerAttributes({
      kind: 'relationship', id: relationship.id, position: relationshipPositions.get(relationship.id)!,
      width: RELATION_SIZE.width, height: RELATION_SIZE.height, attributes: relationship.attributes,
    }, selectedId, nodes, edges)

    relationship.participants.forEach((participant, index) => {
      if (!byId.has(participant.entityId)) return
      const entityNode = nodeId('entity', participant.entityId)
      const relationshipNode = nodeId('relationship', relationship.id)
      edges.push({
        id: `participant-edge:${relationship.id}:${participant.entityId}:${index}`,
        type: 'connector',
        source: entityNode,
        target: relationshipNode,
        sourceHandle: `source-${sideFor(entityPositions.get(participant.entityId)!, relationshipPositions.get(relationship.id)!)}`,
        targetHandle: `target-${opposite(sideFor(entityPositions.get(participant.entityId)!, relationshipPositions.get(relationship.id)!))}`,
        data: { connectorKind: 'participant', cardinality: participant.cardinality, selected: selectedFor(selectedId, relationship.id) },
      })
    })
  })

  return { nodes, edges }
}
