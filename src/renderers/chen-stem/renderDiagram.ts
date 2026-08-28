import type { Edge, Node } from '@xyflow/react'
import type { Attribute, Diagram, Point } from '../../domain/types'
import { GRID_SIZE } from '../../domain/layout'
import type { AttributeSide, DiagramNodeData, RenderedDiagram } from '../types'
import { staticHandleId } from './handles'

/** Fixed dimensions and spacing follow the shared 24px rhythm. */
export const ENTITY_SIZE = { width: GRID_SIZE * 8, height: GRID_SIZE * 4 }
export const RELATION_SIZE = { width: GRID_SIZE * 4, height: GRID_SIZE * 4 }
export const ATTRIBUTE_SIZE = { width: GRID_SIZE * 8, height: GRID_SIZE }
export const ATTRIBUTE_GAP = GRID_SIZE
export const TERMINAL_SIZE = 12
export const MAX_ENTITY_WIDTH = GRID_SIZE * 20
/** Keep the diamond tips on the same grid boundary as the node box. */
export const DIAMOND_INSET = 0

// Semantic order is also the stable tie-break for automatic placement.
export const SIDES: readonly AttributeSide[] = ['north', 'south', 'east', 'west']

type OwnerKind = 'entity' | 'relationship'
export type OwnerGeometry = {
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

type ProjectedAttribute = {
  attribute: Attribute
  geometry: AttributeGeometry
}

const nodeId = (kind: OwnerKind, id: string) => `${kind}:${id}`
export const attrNodeId = (kind: OwnerKind, ownerId: string, attributeId: string) =>
  `attribute:${kind}:${ownerId}:${attributeId}`

export const snapPoint = (point: Point, grid = GRID_SIZE): Point => ({
  x: Math.round(point.x / grid) * grid,
  y: Math.round(point.y / grid) * grid,
})

const roundUpToGrid = (value: number) => Math.ceil(value / GRID_SIZE) * GRID_SIZE

/** Estimate text width without DOM measurement. This avoids React Flow
 * measurement/reprojection loops while still giving long entity names room. */
export function entityWidth(label: string, font: 'serif' | 'sans' = 'serif'): number {
  const textWidth = Array.from(label.trim() || 'Sin nombre').reduce((sum, character) => {
    if (/\s/.test(character)) return sum + 5
    if (/[MW@#%&]/.test(character)) return sum + (font === 'serif' ? 13 : 12)
    if (/[ilI1|.,'`]/.test(character)) return sum + (font === 'serif' ? 5.5 : 5)
    if (/[A-ZÁÉÍÓÚÜÑ]/.test(character)) return sum + (font === 'serif' ? 9.5 : 9)
    return sum + (font === 'serif' ? 8.5 : 8)
  }, 0)
  const padded = roundUpToGrid(textWidth + GRID_SIZE * 2)
  return Math.max(ENTITY_SIZE.width, Math.min(MAX_ENTITY_WIDTH, padded))
}

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

/** Pick sides in two passes. Existing assignments remain stable while their
 * side is clear, but a participant connector is a hard blocker when there is
 * another side available. This is important after a relationship is moved:
 * the connector can change sides without changing the attribute metadata. */
export function allocateAttributeSides(
  attributes: Attribute[],
  assignments: Record<string, unknown> = {},
  occupiedSides: Partial<Record<AttributeSide, number>> = {},
): Record<string, AttributeSide> {
  const counts: Record<AttributeSide, number> = { north: 0, east: 0, south: 0, west: 0 }
  const result: Record<string, AttributeSide> = {}

  // Preserve clear assignments first. Attributes whose old side is now used
  // by a relationship are intentionally left for the second pass.
  attributes.forEach((attribute) => {
    const assigned = sideAssignment(assignments[attribute.id])
    if (assigned && !(occupiedSides[assigned] ?? 0)) {
      result[attribute.id] = assigned
      counts[assigned] += 1
    }
  })

  attributes.forEach((attribute) => {
    if (result[attribute.id]) return
    const assigned = sideAssignment(assignments[attribute.id])
    const side = SIDES.reduce((best, candidate) => {
      const candidateOccupied = occupiedSides[candidate] ?? 0
      const bestOccupied = occupiedSides[best] ?? 0
      // Keep connectors and attribute stems on separate sides whenever the
      // four sides make that possible. If all sides are occupied, the
      // connector count still gives the least crowded side the preference.
      const candidateScore = counts[candidate]
        + (candidateOccupied ? 1000 + candidateOccupied * 10 : 0)
        + (assigned === candidate ? 0.25 : 0)
      const bestScore = counts[best]
        + (bestOccupied ? 1000 + bestOccupied * 10 : 0)
        + (assigned === best ? 0.25 : 0)
      return candidateScore < bestScore ? candidate : best
    }, SIDES[0])
    result[attribute.id] = side
    counts[side] += 1
  })
  return result
}

/** Distribute attachment points across the usable side. When enough grid
 * slots exist every point is exactly on-grid; dense one-side assignments fall
 * back to even half-grid-margined spacing without collapsing coordinates. */
export function distributedSlots(ownerSize: number, count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [Math.round(ownerSize / (GRID_SIZE * 2)) * GRID_SIZE]

  const firstUnit = 1
  const lastUnit = Math.max(firstUnit, Math.floor(ownerSize / GRID_SIZE) - 1)
  const gridCapacity = lastUnit - firstUnit + 1
  if (count <= gridCapacity) {
    return Array.from({ length: count }, (_, index) => {
      const unit = firstUnit + Math.round(index * (lastUnit - firstUnit) / (count - 1))
      return unit * GRID_SIZE
    })
  }

  const margin = TERMINAL_SIZE / 2
  const usable = Math.max(0, ownerSize - margin * 2)
  return Array.from({ length: count }, (_, index) => margin + index * usable / (count - 1))
}

/** Exact visible owner boundary for an attribute stem. Relationship points
 * lie on the SVG polygon, rather than the surrounding 96px layout square. */
export function ownerBoundaryPoint(owner: OwnerGeometry, side: AttributeSide, slot: number): Point {
  if (owner.kind === 'entity') {
    if (side === 'north') return { x: owner.position.x + slot, y: owner.position.y }
    if (side === 'south') return { x: owner.position.x + slot, y: owner.position.y + owner.height }
    if (side === 'east') return { x: owner.position.x + owner.width, y: owner.position.y + slot }
    return { x: owner.position.x, y: owner.position.y + slot }
  }

  const cx = owner.width / 2
  const cy = owner.height / 2
  const horizontalSlope = (cy - DIAMOND_INSET) / (cx - DIAMOND_INSET)
  const verticalSlope = (cx - DIAMOND_INSET) / (cy - DIAMOND_INSET)
  if (side === 'north') {
    return {
      x: owner.position.x + slot,
      y: owner.position.y + DIAMOND_INSET + Math.abs(slot - cx) * horizontalSlope,
    }
  }
  if (side === 'south') {
    return {
      x: owner.position.x + slot,
      y: owner.position.y + owner.height - DIAMOND_INSET - Math.abs(slot - cx) * horizontalSlope,
    }
  }
  if (side === 'east') {
    return {
      x: owner.position.x + owner.width - DIAMOND_INSET - Math.abs(slot - cy) * verticalSlope,
      y: owner.position.y + slot,
    }
  }
  return {
    x: owner.position.x + DIAMOND_INSET + Math.abs(slot - cy) * verticalSlope,
    y: owner.position.y + slot,
  }
}

export type AttributeGeometry = {
  position: Point
  side: AttributeSide
  slot: number
  step: number
  terminal: Point
  attachment: Point
}

/** Pure geometry for a renderer-managed attribute. The terminal and visible
 * owner boundary share an axis, so the stem is always a straight H/V line. */
export function attributeGeometry(
  owner: OwnerGeometry,
  side: AttributeSide,
  sideIndex: number,
  sideCount = Math.max(1, sideIndex + 1),
): AttributeGeometry {
  const ownerSize = side === 'north' || side === 'south' ? owner.width : owner.height
  const slot = distributedSlots(ownerSize, sideCount)[sideIndex]
  const step = sideIndex
  const attachment = ownerBoundaryPoint(owner, side, slot)
  let terminal: Point
  let position: Point
  if (side === 'north') {
    terminal = { x: attachment.x, y: attachment.y - ATTRIBUTE_GAP - step * GRID_SIZE }
    position = { x: terminal.x - ATTRIBUTE_SIZE.width / 2, y: terminal.y - ATTRIBUTE_SIZE.height + TERMINAL_SIZE / 2 }
  } else if (side === 'south') {
    terminal = { x: attachment.x, y: attachment.y + ATTRIBUTE_GAP + step * GRID_SIZE }
    position = { x: terminal.x - ATTRIBUTE_SIZE.width / 2, y: terminal.y - TERMINAL_SIZE / 2 }
  } else if (side === 'east') {
    terminal = { x: attachment.x + ATTRIBUTE_GAP, y: attachment.y }
    position = { x: terminal.x - TERMINAL_SIZE / 2, y: terminal.y - ATTRIBUTE_SIZE.height / 2 }
  } else {
    terminal = { x: attachment.x - ATTRIBUTE_GAP, y: attachment.y }
    position = { x: terminal.x - ATTRIBUTE_SIZE.width + TERMINAL_SIZE / 2, y: terminal.y - ATTRIBUTE_SIZE.height / 2 }
  }
  return { position, side, slot, step, terminal, attachment }
}

const handleId = (side: AttributeSide, attributeId: string) => `source-${side}-${attributeId}`

export function ownerAttributeGeometries(
  owner: OwnerGeometry,
  assignments: Record<string, AttributeSide>,
): ProjectedAttribute[] {
  const counts: Record<AttributeSide, number> = { north: 0, east: 0, south: 0, west: 0 }
  owner.attributes.forEach((attribute) => { counts[assignments[attribute.id]] += 1 })
  const indices: Record<AttributeSide, number> = { north: 0, east: 0, south: 0, west: 0 }
  return owner.attributes.map((attribute) => {
    const side = assignments[attribute.id]
    return { attribute, geometry: attributeGeometry(owner, side, indices[side]++, counts[side]) }
  })
}

function handlesFor(owner: OwnerGeometry, projected: ProjectedAttribute[]) {
  return projected.map(({ attribute, geometry }) => ({
    id: attribute.id,
    side: geometry.side,
    offset: geometry.slot,
    x: geometry.attachment.x - owner.position.x,
    y: geometry.attachment.y - owner.position.y,
  }))
}

function ownerAttributes(
  owner: OwnerGeometry,
  selectedId: string | undefined,
  projected: ProjectedAttribute[],
  nodes: Node<DiagramNodeData>[],
  edges: Edge[],
) {
  projected.forEach(({ attribute, geometry }) => {
    const side = geometry.side
    const id = attrNodeId(owner.kind, owner.id, attribute.id)
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
        terminal: geometry.terminal,
        attachment: geometry.attachment,
      },
    })
    edges.push({
      id: `attribute-edge:${owner.kind}:${owner.id}:${attribute.id}`,
      type: 'connector',
      source: nodeId(owner.kind, owner.id),
      target: id,
      sourceHandle: handleId(side, attribute.id),
      targetHandle: 'target-terminal',
      selectable: false,
      data: { connectorKind: 'attribute', side, lane: side, sourceKind: owner.kind, selected: selectedFor(selectedId, owner.id) },
    })
  })
}

type ConnectionMap = Map<string, Partial<Record<AttributeSide, number>>>

function connectionSides(
  diagram: Diagram,
  entityPositions: Map<string, Point>,
  relationshipPositions: Map<string, Point>,
  entityWidths: Map<string, number>,
): ConnectionMap {
  const result: ConnectionMap = new Map()
  const increment = (id: string, side: AttributeSide) => {
    const current = result.get(id) ?? {}
    current[side] = (current[side] ?? 0) + 1
    result.set(id, current)
  }
  diagram.relationships.forEach((relationship) => {
    const relationshipPosition = relationshipPositions.get(relationship.id)
    if (!relationshipPosition) return
    const relationshipCenter = center(relationshipPosition, RELATION_SIZE.width, RELATION_SIZE.height)
    relationship.participants.forEach((participant) => {
      const entityPosition = entityPositions.get(participant.entityId)
      const width = entityWidths.get(participant.entityId)
      if (!entityPosition || !width) return
      const entityCenter = center(entityPosition, width, ENTITY_SIZE.height)
      const entitySide = sideFor(entityCenter, relationshipCenter)
      increment(participant.entityId, entitySide)
      increment(relationship.id, oppositeSide(entitySide))
    })
  })
  return result
}

/** Projects semantic data into a disposable React Flow graph. Attribute
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
  const entityWidths = new Map<string, number>()
  const font = view.theme === 'modern' || (view.theme === 'custom' && view.customTheme?.font === 'sans') ? 'sans' : 'serif'

  diagram.entities.forEach((entity, index) => {
    const position = normalizedPosition(positions[entity.id] ?? { x: GRID_SIZE * (5 + index * 10), y: GRID_SIZE * 6 })
    const width = entityWidth(entity.name, font)
    entityPositions.set(entity.id, position)
    entityWidths.set(entity.id, width)
    nodes.push({
      id: nodeId('entity', entity.id), type: 'entity', position,
      width, height: ENTITY_SIZE.height, draggable: true,
      data: {
        semanticId: entity.id, kind: 'entity', label: entity.name, selected: selectedFor(selectedId, entity.id),
        entityKind: entity.kind, kindType: entity.kind, width, height: ENTITY_SIZE.height,
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
        cardinalityPending: Boolean(view.pendingCardinalities?.[relationship.id]),
      },
    })
  })

  const occupied = connectionSides(diagram, entityPositions, relationshipPositions, entityWidths)
  const assignments = view.attributeLayout ?? {}
  diagram.entities.forEach((entity) => {
    const sides = allocateAttributeSides(entity.attributes, assignments, occupied.get(entity.id))
    const owner: OwnerGeometry = {
      kind: 'entity', id: entity.id, position: entityPositions.get(entity.id)!,
      width: entityWidths.get(entity.id)!, height: ENTITY_SIZE.height, attributes: entity.attributes,
    }
    const projected = ownerAttributeGeometries(owner, sides)
    const node = nodes.find((candidate) => candidate.id === nodeId('entity', entity.id))
    if (node) node.data.attributeHandles = handlesFor(owner, projected)
    ownerAttributes(owner, selectedId, projected, nodes, edges)
  })
  diagram.relationships.forEach((relationship) => {
    const sides = allocateAttributeSides(relationship.attributes, assignments, occupied.get(relationship.id))
    const owner: OwnerGeometry = {
      kind: 'relationship', id: relationship.id, position: relationshipPositions.get(relationship.id)!,
      ...RELATION_SIZE, attributes: relationship.attributes,
    }
    const projected = ownerAttributeGeometries(owner, sides)
    const node = nodes.find((candidate) => candidate.id === nodeId('relationship', relationship.id))
    if (node) node.data.attributeHandles = handlesFor(owner, projected)
    ownerAttributes(owner, selectedId, projected, nodes, edges)
  })

  const byId = new Map(diagram.entities.map((entity) => [entity.id, entity]))
  diagram.relationships.forEach((relationship) => {
    const participantCounts = new Map<string, number>()
    relationship.participants.forEach((participant) => {
      participantCounts.set(participant.entityId, (participantCounts.get(participant.entityId) ?? 0) + 1)
    })
    const participantOccurrences = new Map<string, number>()
    relationship.participants.forEach((participant, index) => {
      if (!byId.has(participant.entityId)) return
      const entityPosition = entityPositions.get(participant.entityId)!
      const relationshipPosition = relationshipPositions.get(relationship.id)!
      const side = sideFor(
        center(entityPosition, entityWidths.get(participant.entityId)!, ENTITY_SIZE.height),
        center(relationshipPosition, RELATION_SIZE.width, RELATION_SIZE.height),
      )
      const occurrence = participantOccurrences.get(participant.entityId) ?? 0
      participantOccurrences.set(participant.entityId, occurrence + 1)
      const count = participantCounts.get(participant.entityId) ?? 1
      const recursiveOffset = count > 1
        ? (occurrence - (count - 1) / 2) * (count === 2 ? GRID_SIZE * 2 : GRID_SIZE)
        : undefined
      edges.push({
        id: `participant-edge:${relationship.id}:${participant.entityId}:${index}`,
        type: 'connector', source: nodeId('entity', participant.entityId), target: nodeId('relationship', relationship.id),
        sourceHandle: staticHandleId('source', side), targetHandle: staticHandleId('target', oppositeSide(side)),
        data: {
          connectorKind: 'participant',
          relationshipId: relationship.id,
          cardinality: participant.cardinality,
          cardinalityPending: Boolean(view.pendingCardinalities?.[relationship.id]),
          recursiveOffset,
          selected: selectedFor(selectedId, relationship.id),
        },
      })
    })
  })

  return { nodes, edges }
}
