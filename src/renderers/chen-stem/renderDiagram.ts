import type { Edge, Node } from '@xyflow/react'
import type { Attribute, Diagram, Point } from '../../domain/types'
import { GRID_SIZE } from '../../domain/layout'
import type { AttributeSide, DiagramNodeData, RenderedDiagram } from '../types'

/** Dimensions are deliberately multiples of the shared 24px rhythm. */
export const ENTITY_SIZE = { width: GRID_SIZE * 8, height: GRID_SIZE * 4 }
export const RELATION_SIZE = { width: GRID_SIZE * 4, height: GRID_SIZE * 4 }
export const ATTRIBUTE_SIZE = { width: GRID_SIZE * 8, height: GRID_SIZE }
export const ATTRIBUTE_GAP = GRID_SIZE
export const TERMINAL_SIZE = 12

// Semantic order is also the stable tie-break for automatic placement.
export const SIDES: readonly AttributeSide[] = ['north', 'south', 'east', 'west']

type OwnerKind = 'entity' | 'relationship'
type Owner = {
  kind: OwnerKind
  id: string
  position: Point
  width: number
  height: number
  attributes: Attribute[]
}

type ViewWithLayout = Diagram['view'] & {
  layoutMode?: 'structured' | 'freeform'
  attributeLayout?: Record<string, { side: AttributeSide } | AttributeSide>
}

const nodeId = (kind: OwnerKind, id: string) => `${kind}:${id}`
export const attrNodeId = (kind: OwnerKind, ownerId: string, attributeId: string) =>
  `attribute:${kind}:${ownerId}:${attributeId}`

export const snapPoint = (point: Point, grid = GRID_SIZE): Point => ({
  x: Math.round(point.x / grid) * grid,
  y: Math.round(point.y / grid) * grid,
})

function center(position: Point, width: number, height: number): Point {
  return { x: position.x + width / 2, y: position.y + height / 2 }
}

export function sideFor(from: Point, to: Point): AttributeSide {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'east' : 'west'
  return dy >= 0 ? 'south' : 'north'
}

export function oppositeSide(side: AttributeSide): AttributeSide {
  return side === 'north' ? 'south' : side === 'east' ? 'west' : side === 'south' ? 'north' : 'east'
}

const selectedFor = (selectedId: string | undefined, id: string) =>
  selectedId === id || selectedId === nodeId('entity', id) || selectedId === nodeId('relationship', id)

const sideAssignment = (value: unknown): AttributeSide | undefined => {
  if (typeof value === 'string' && SIDES.includes(value as AttributeSide)) return value as AttributeSide
  if (value && typeof value === 'object' && 'side' in value) {
    const side = (value as { side?: unknown }).side
    if (typeof side === 'string' && SIDES.includes(side as AttributeSide)) return side as AttributeSide
  }
  return undefined
}

/** Pick the least populated side, with stable tie breaking. A connection on a
 * side is a soft penalty, not a solver: this keeps diagrams predictable. */
export function allocateAttributeSides(
  attributes: Attribute[],
  assignments: Record<string, unknown> = {},
  occupiedSides: Partial<Record<AttributeSide, number>> = {},
): Record<string, AttributeSide> {
  const counts: Record<AttributeSide, number> = { north: 0, east: 0, south: 0, west: 0 }
  const result: Record<string, AttributeSide> = {}
  attributes.forEach((attribute) => {
    const assigned = sideAssignment(assignments[attribute.id])
    if (assigned) {
      result[attribute.id] = assigned
      counts[assigned] += 1
      return
    }
    const side = SIDES.reduce((best, candidate) => {
      const candidateScore = counts[candidate] + (occupiedSides[candidate] ?? 0) * 1.5
      const bestScore = counts[best] + (occupiedSides[best] ?? 0) * 1.5
      return candidateScore < bestScore ? candidate : best
    }, SIDES[0])
    result[attribute.id] = side
    counts[side] += 1
  })
  return result
}

function slotOffset(ownerSize: number, index: number): number {
  // Start one grid unit in from the boundary. This gives exact, repeatable
  // attachment points for the normal 192x96 and 96x96 owner boxes.
  const offset = GRID_SIZE * (index + 1)
  // Allow the final slot to land on the far boundary (rather than collapsing
  // two attributes onto one point when a user deliberately keeps many attrs
  // on one side).
  return Math.min(Math.max(GRID_SIZE, offset), Math.max(GRID_SIZE, ownerSize))
}

export type AttributeGeometry = {
  position: Point
  side: AttributeSide
  slot: number
  step: number
  terminal: Point
  attachment: Point
}

/** Pure geometry for a renderer-managed attribute. The terminal and owner
 * attachment share an axis, so the stem is always a straight H/V segment. */
export function attributeGeometry(owner: Owner, side: AttributeSide, sideIndex: number): AttributeGeometry {
  const slot = slotOffset(side === 'north' || side === 'south' ? owner.width : owner.height, sideIndex)
  const step = sideIndex
  const cx = owner.position.x + slot
  const cy = owner.position.y + slot
  let position: Point
  let terminal: Point
  let attachment: Point
  if (side === 'north') {
    terminal = { x: cx, y: owner.position.y - ATTRIBUTE_GAP - step * GRID_SIZE }
    position = { x: cx - ATTRIBUTE_SIZE.width / 2, y: terminal.y - ATTRIBUTE_SIZE.height + TERMINAL_SIZE / 2 }
    attachment = { x: cx, y: owner.position.y }
  } else if (side === 'south') {
    terminal = { x: cx, y: owner.position.y + owner.height + ATTRIBUTE_GAP + step * GRID_SIZE }
    position = { x: cx - ATTRIBUTE_SIZE.width / 2, y: terminal.y - TERMINAL_SIZE / 2 }
    attachment = { x: cx, y: owner.position.y + owner.height }
  } else if (side === 'east') {
    terminal = { x: owner.position.x + owner.width + ATTRIBUTE_GAP, y: cy }
    position = { x: terminal.x - TERMINAL_SIZE / 2, y: cy - ATTRIBUTE_SIZE.height / 2 }
    attachment = { x: owner.position.x + owner.width, y: cy }
  } else {
    terminal = { x: owner.position.x - ATTRIBUTE_GAP, y: cy }
    position = { x: terminal.x - ATTRIBUTE_SIZE.width + TERMINAL_SIZE / 2, y: cy - ATTRIBUTE_SIZE.height / 2 }
    attachment = { x: owner.position.x, y: cy }
  }
  return { position, side, slot, step, terminal, attachment }
}

const handleId = (side: AttributeSide, attributeId: string) => `source-${side}-${attributeId}`

function handlesFor(owner: Owner, attributes: Attribute[], assignments: Record<string, AttributeSide>) {
  const sideIndices: Record<AttributeSide, number> = { north: 0, east: 0, south: 0, west: 0 }
  return attributes.map((attribute) => {
    const side = assignments[attribute.id]
    const index = sideIndices[side]++
    const geometry = attributeGeometry(owner, side, index)
    return { id: attribute.id, side, offset: geometry.slot }
  })
}

function ownerAttributes(
  owner: Owner,
  selectedId: string | undefined,
  assignments: Record<string, AttributeSide>,
  nodes: Node<DiagramNodeData>[],
  edges: Edge[],
) {
  const sideIndices: Record<AttributeSide, number> = { north: 0, east: 0, south: 0, west: 0 }
  owner.attributes.forEach((attribute) => {
    const side = assignments[attribute.id]
    const geometry = attributeGeometry(owner, side, sideIndices[side]++)
    const id = attrNodeId(owner.kind, owner.id, attribute.id)
    const semanticOwnerId = nodeId(owner.kind, owner.id)
    nodes.push({
      id,
      type: 'attribute',
      position: geometry.position,
      width: ATTRIBUTE_SIZE.width,
      height: ATTRIBUTE_SIZE.height,
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
        side,
        lane: side,
        step: geometry.step,
      },
    })
    edges.push({
      id: `attribute-edge:${owner.kind}:${owner.id}:${attribute.id}`,
      type: 'connector',
      source: semanticOwnerId,
      target: id,
      sourceHandle: handleId(side, attribute.id),
      targetHandle: 'target-terminal',
      selectable: false,
      data: { connectorKind: 'attribute', side, lane: side, sourceKind: owner.kind, selected: selectedFor(selectedId, owner.id) },
    })
  })
}

type ConnectionMap = Map<string, Partial<Record<AttributeSide, number>>>

function connectionSides(diagram: Diagram, positions: Map<string, Point>): ConnectionMap {
  const result: ConnectionMap = new Map()
  const increment = (id: string, side: AttributeSide) => {
    const current = result.get(id) ?? {}
    current[side] = (current[side] ?? 0) + 1
    result.set(id, current)
  }
  diagram.relationships.forEach((relationship) => {
    const relationPosition = positions.get(relationship.id)
    if (!relationPosition) return
    const relationCenter = center(relationPosition, RELATION_SIZE.width, RELATION_SIZE.height)
    relationship.participants.forEach((participant) => {
      const entityPosition = positions.get(participant.entityId)
      if (!entityPosition) return
      const entityCenter = center(entityPosition, ENTITY_SIZE.width, ENTITY_SIZE.height)
      increment(participant.entityId, sideFor(entityCenter, relationCenter))
      increment(relationship.id, oppositeSide(sideFor(entityCenter, relationCenter)))
    })
  })
  return result
}

/** Projects the semantic model into a disposable React Flow graph. Attribute
 * positions are always derived here; no attribute coordinates are persisted. */
export function renderDiagram(diagram: Diagram, selectedId?: string): RenderedDiagram {
  const nodes: Node<DiagramNodeData>[] = []
  const edges: Edge[] = []
  const view = diagram.view as ViewWithLayout
  const structured = view.layoutMode !== 'freeform'
  const positions = view.positions ?? {}
  const normalizedPosition = (position: Point) => structured ? snapPoint(position) : position
  const entityPositions = new Map<string, Point>()
  const relationshipPositions = new Map<string, Point>()

  diagram.entities.forEach((entity, index) => {
    const position = normalizedPosition(positions[entity.id] ?? { x: GRID_SIZE * (5 + index * 10), y: GRID_SIZE * 6 })
    entityPositions.set(entity.id, position)
    nodes.push({
      id: nodeId('entity', entity.id), type: 'entity', position,
      width: ENTITY_SIZE.width, height: ENTITY_SIZE.height, draggable: true,
      data: {
        semanticId: entity.id, kind: 'entity', label: entity.name, selected: selectedFor(selectedId, entity.id),
        entityKind: entity.kind, kindType: entity.kind, width: ENTITY_SIZE.width, height: ENTITY_SIZE.height,
      },
    })
  })

  diagram.relationships.forEach((relationship, index) => {
    const position = normalizedPosition(positions[relationship.id] ?? { x: GRID_SIZE * (10 + index * 12), y: GRID_SIZE * 14 })
    relationshipPositions.set(relationship.id, position)
    nodes.push({
      id: nodeId('relationship', relationship.id), type: 'relationship', position,
      width: RELATION_SIZE.width, height: RELATION_SIZE.height, draggable: true,
      data: {
        semanticId: relationship.id, kind: 'relationship', label: relationship.name,
        selected: selectedFor(selectedId, relationship.id), width: RELATION_SIZE.width, height: RELATION_SIZE.height,
      },
    })
  })

  const allPositions = new Map([...entityPositions, ...relationshipPositions])
  const occupied = connectionSides(diagram, allPositions)
  const assignments = view.attributeLayout ?? {}
  diagram.entities.forEach((entity) => {
    const sides = allocateAttributeSides(entity.attributes, assignments, occupied.get(entity.id))
    const owner: Owner = { kind: 'entity', id: entity.id, position: entityPositions.get(entity.id)!, ...ENTITY_SIZE, attributes: entity.attributes }
    const handles = handlesFor(owner, entity.attributes, sides)
    const node = nodes.find((candidate) => candidate.id === nodeId('entity', entity.id))
    if (node) node.data.attributeHandles = handles
    ownerAttributes(owner, selectedId, sides, nodes, edges)
  })
  diagram.relationships.forEach((relationship) => {
    const sides = allocateAttributeSides(relationship.attributes, assignments, occupied.get(relationship.id))
    const owner: Owner = { kind: 'relationship', id: relationship.id, position: relationshipPositions.get(relationship.id)!, ...RELATION_SIZE, attributes: relationship.attributes }
    const handles = handlesFor(owner, relationship.attributes, sides)
    const node = nodes.find((candidate) => candidate.id === nodeId('relationship', relationship.id))
    if (node) node.data.attributeHandles = handles
    ownerAttributes(owner, selectedId, sides, nodes, edges)
  })

  const byId = new Map(diagram.entities.map((entity) => [entity.id, entity]))
  diagram.relationships.forEach((relationship) => {
    relationship.participants.forEach((participant, index) => {
      if (!byId.has(participant.entityId)) return
      const entityPosition = entityPositions.get(participant.entityId)!
      const relationPosition = relationshipPositions.get(relationship.id)!
      const side = sideFor(
        center(entityPosition, ENTITY_SIZE.width, ENTITY_SIZE.height),
        center(relationPosition, RELATION_SIZE.width, RELATION_SIZE.height),
      )
      edges.push({
        id: `participant-edge:${relationship.id}:${participant.entityId}:${index}`,
        type: 'connector', source: nodeId('entity', participant.entityId), target: nodeId('relationship', relationship.id),
        sourceHandle: `source-${side}`, targetHandle: `target-${oppositeSide(side)}`,
        data: { connectorKind: 'participant', cardinality: participant.cardinality, selected: selectedFor(selectedId, relationship.id) },
      })
    })
  })

  return { nodes, edges }
}
