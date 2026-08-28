import type {
  AttributeSide,
  Diagram,
  LayoutMode,
  Point,
} from './types'

/** The common unit used by the academic renderer and its view state. */
export const GRID_SIZE = 24

export const ATTRIBUTE_SIDES: readonly AttributeSide[] = [
  'north',
  'east',
  'south',
  'west',
]

const isFinitePoint = (point: Point | undefined): point is Point => {
  if (!point) return false
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

export const snapCoordinate = (value: number, gridSize = GRID_SIZE) =>
  Number.isFinite(value) ? Math.round(value / gridSize) * gridSize : 0

export const snapPoint = (point: Point, gridSize = GRID_SIZE): Point => ({
  x: snapCoordinate(point.x, gridSize),
  y: snapCoordinate(point.y, gridSize),
})

/**
 * Default placement for a relationship created from two entity positions.
 * The result is a relationship top-left coordinate, not its center. Keeping
 * this in the view/layout layer makes gesture and sheet creation share the
 * same deterministic geometry without putting React Flow in the domain.
 */
export const relationshipPositionBetween = (
  source: Point,
  target: Point,
  sourceWidth = GRID_SIZE * 8,
  targetWidth = GRID_SIZE * 8,
  sourceSide?: AttributeSide,
): Point => {
  if (source.x === target.x && source.y === target.y) {
    const side = sourceSide ?? 'east'
    if (side === 'east') return { x: source.x + sourceWidth + GRID_SIZE * 2, y: source.y }
    if (side === 'west') return { x: source.x - GRID_SIZE * 4 - GRID_SIZE * 2, y: source.y }
    if (side === 'south') return { x: source.x, y: source.y + GRID_SIZE * 4 + GRID_SIZE * 2 }
    return { x: source.x, y: source.y - GRID_SIZE * 4 - GRID_SIZE * 2 }
  }

  return {
    x: (source.x + sourceWidth / 2 + target.x + targetWidth / 2) / 2 - GRID_SIZE * 2,
    y: (source.y + GRID_SIZE * 2 + target.y + GRID_SIZE * 2) / 2 - GRID_SIZE * 2,
  }
}

export const isAttributeSide = (value: unknown): value is AttributeSide =>
  typeof value === 'string' && ATTRIBUTE_SIDES.includes(value as AttributeSide)

const attributeIdsByOwner = (diagram: Diagram) => {
  const byOwner = new Map<string, { attributes: { id: string }[] }>()
  diagram.entities.forEach((entity) => byOwner.set(entity.id, { attributes: entity.attributes }))
  diagram.relationships.forEach((relationship) => byOwner.set(relationship.id, {
    attributes: relationship.attributes,
  }))
  return byOwner
}

const majorIds = (diagram: Diagram) => new Set([
  ...diagram.entities.map((entity) => entity.id),
  ...diagram.relationships.map((relationship) => relationship.id),
])

/** Snap only entity/relationship coordinates; attributes have no coordinates. */
export const snapMajorPositions = (diagram: Diagram): Record<string, Point> => {
  const ids = majorIds(diagram)
  return Object.fromEntries(
    Object.entries(diagram.view.positions).map(([id, point]) => [
      id,
      ids.has(id) && isFinitePoint(point) ? snapPoint(point) : { ...point },
    ]),
  )
}

/** Alias kept intentionally small for callers that only have a positions map. */
export const snapPositions = (positions: Record<string, Point>, ids?: ReadonlySet<string>) =>
  Object.fromEntries(Object.entries(positions).map(([id, point]) => [
    id,
    (!ids || ids.has(id)) && isFinitePoint(point) ? snapPoint(point) : { ...point },
  ]))

const sideFromDelta = (dx: number, dy: number): AttributeSide => {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'east' : 'west'
  return dy >= 0 ? 'south' : 'north'
}

/**
 * Sides already used by participant connectors. This deliberately uses only
 * relative owner/participant coordinates: it remains deterministic without
 * coupling domain state to renderer dimensions.
 */
const connectorSideCounts = (diagram: Diagram) => {
  const result = new Map<string, Partial<Record<AttributeSide, number>>>()
  const add = (id: string, side: AttributeSide) => {
    const counts = result.get(id) ?? {}
    counts[side] = (counts[side] ?? 0) + 1
    result.set(id, counts)
  }
  const position = (id: string): Point => diagram.view.positions[id] ?? { x: 0, y: 0 }
  // Keep these view-only dimensions aligned with the academic renderer's
  // grid-sized boxes. Connector side choice is based on centers, not corners.
  const entityCenter = (id: string): Point => {
    const point = position(id)
    return { x: point.x + GRID_SIZE * 4, y: point.y + GRID_SIZE * 2 }
  }
  const relationshipCenter = (id: string): Point => {
    const point = position(id)
    return { x: point.x + GRID_SIZE * 2, y: point.y + GRID_SIZE * 2 }
  }

  diagram.relationships.forEach((relationship) => {
    const relationshipPoint = relationshipCenter(relationship.id)
    relationship.participants.forEach((participant) => {
      if (!diagram.entities.some((entity) => entity.id === participant.entityId)) return
      const entityPoint = entityCenter(participant.entityId)
      add(participant.entityId, sideFromDelta(
        relationshipPoint.x - entityPoint.x,
        relationshipPoint.y - entityPoint.y,
      ))
      add(relationship.id, sideFromDelta(
        entityPoint.x - relationshipPoint.x,
        entityPoint.y - relationshipPoint.y,
      ))
    })
  })
  return result
}

const sidePenalty = (diagram: Diagram, ownerId: string, side: AttributeSide) =>
  (connectorSideCounts(diagram).get(ownerId)?.[side] ?? 0) * 2

/** Return the least occupied side using semantic order as the stable tie-break. */
export const chooseAttributeSide = (
  diagram: Diagram,
  ownerId: string,
  counts: Partial<Record<AttributeSide, number>> = {},
): AttributeSide => {
  let best = ATTRIBUTE_SIDES[0]
  let bestScore = Number.POSITIVE_INFINITY
  ATTRIBUTE_SIDES.forEach((side) => {
    const score = (counts[side] ?? 0) + sidePenalty(diagram, ownerId, side)
    if (score < bestScore) {
      best = side
      bestScore = score
    }
  })
  return best
}

const normalizedAssignments = (diagram: Diagram) => {
  const existing = diagram.view.attributeLayout ?? {}
  const assignments: Record<string, { side: AttributeSide }> = {}
  const countsByOwner = new Map<string, Partial<Record<AttributeSide, number>>>()

  attributeIdsByOwner(diagram).forEach(({ attributes }, ownerId) => {
    const counts: Partial<Record<AttributeSide, number>> = {}
    countsByOwner.set(ownerId, counts)
    attributes.forEach((attribute) => {
      const assignment = existing[attribute.id] as unknown
      const side = typeof assignment === 'string'
        ? assignment
        : (assignment && typeof assignment === 'object' && 'side' in assignment
          ? (assignment as { side?: unknown }).side
          : undefined)
      if (!isAttributeSide(side)) return
      assignments[attribute.id] = { side }
      counts[side] = (counts[side] ?? 0) + 1
    })
  })

  return { assignments, countsByOwner }
}

/**
 * Keep all valid side choices stable and assign only missing attributes.
 * Unknown/orphan metadata is pruned as part of persistence normalization.
 */
export const ensureAttributeLayout = (diagram: Diagram): Record<string, { side: AttributeSide }> => {
  const { assignments, countsByOwner } = normalizedAssignments(diagram)
  const connectors = connectorSideCounts(diagram)
  const choose = (ownerId: string, counts: Partial<Record<AttributeSide, number>>) => {
    let best = ATTRIBUTE_SIDES[0]
    let bestScore = Number.POSITIVE_INFINITY
    ATTRIBUTE_SIDES.forEach((side) => {
      const score = (counts[side] ?? 0) + ((connectors.get(ownerId)?.[side] ?? 0) * 2)
      if (score < bestScore) {
        best = side
        bestScore = score
      }
    })
    return best
  }

  attributeIdsByOwner(diagram).forEach(({ attributes }, ownerId) => {
    const counts = countsByOwner.get(ownerId)!
    attributes.forEach((attribute) => {
      if (assignments[attribute.id]) return
      const side = choose(ownerId, counts)
      assignments[attribute.id] = { side }
      counts[side] = (counts[side] ?? 0) + 1
    })
  })
  return assignments
}

export const reflowAttributeLayout = (diagram: Diagram): Record<string, { side: AttributeSide }> => {
  const reset: Diagram = {
    ...diagram,
    view: { ...diagram.view, attributeLayout: {} },
  }
  return ensureAttributeLayout(reset)
}

export const normalizeLayoutMode = (value: unknown): LayoutMode =>
  value === 'freeform' ? 'freeform' : 'structured'
