/* This file intentionally exports pure route helpers beside the edge adapter
 * so renderer tests can verify geometry without mounting React Flow. */
/* eslint-disable react-refresh/only-export-components */
import { BaseEdge, EdgeLabelRenderer, Position, type Edge, type EdgeProps } from '@xyflow/react'
import type { Cardinality, Point } from '../../domain/types'
import { cardinalityLabel } from '../../domain/types'

export type ConnectorData = {
  connectorKind?: 'participant' | 'attribute'
  relationshipId?: string
  cardinality?: Cardinality
  side?: 'north' | 'east' | 'south' | 'west'
  sourceKind?: 'entity' | 'relationship'
  selected?: boolean
  cardinalityPending?: boolean
  recursiveOffset?: number
  onCardinalityDoubleClick?: () => void
}

type ConnectorEdgeType = Edge<ConnectorData>

export type RoutePoint = Point

const horizontal = (position?: Position) => position === Position.Left || position === Position.Right
const vertical = (position?: Position) => position === Position.Top || position === Position.Bottom

function withoutDuplicatePoints(points: RoutePoint[]): RoutePoint[] {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
}

/** A small deterministic Manhattan router. It intentionally does not inspect
 * other nodes: the academic diagram benefits more from stable elbows than a
 * surprising obstacle-avoidance detour. */
export function orthogonalRoute(
  source: RoutePoint,
  target: RoutePoint,
  sourcePosition?: Position,
  targetPosition?: Position,
): RoutePoint[] {
  if (source.x === target.x || source.y === target.y) return [source, target]

  if (horizontal(sourcePosition) && vertical(targetPosition)) {
    return [source, { x: target.x, y: source.y }, target]
  }
  if (vertical(sourcePosition) && horizontal(targetPosition)) {
    return [source, { x: source.x, y: target.y }, target]
  }

  if (horizontal(sourcePosition) && horizontal(targetPosition)) {
    const x = Math.round((source.x + target.x) / 2)
    return [source, { x, y: source.y }, { x, y: target.y }, target]
  }
  if (vertical(sourcePosition) && vertical(targetPosition)) {
    const y = Math.round((source.y + target.y) / 2)
    return [source, { x: source.x, y }, { x: target.x, y }, target]
  }

  // Static snapshots and custom handles may omit Position. Pick the dominant
  // axis and retain the same one/two-elbow shape.
  if (Math.abs(target.x - source.x) >= Math.abs(target.y - source.y)) {
    return [source, { x: target.x, y: source.y }, target]
  }
  return [source, { x: source.x, y: target.y }, target]
}

export function routePath(points: RoutePoint[]): string {
  const clean = withoutDuplicatePoints(points)
  return clean.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

/** Offset a recursive participant at both ends of its connector. Source
 * points sit on a rectangular entity edge; target points sit on the diamond
 * boundary, so the latter must move inward as it moves along the edge. */
export function offsetConnectionPoint(
  point: Point,
  position: Position | undefined,
  offset: number,
  end: 'source' | 'target',
): Point {
  if (!offset) return point
  if (end === 'source') {
    return position === Position.Left || position === Position.Right
      ? { x: point.x, y: point.y + offset }
      : { x: point.x + offset, y: point.y }
  }
  if (position === Position.Left) return { x: point.x + Math.abs(offset), y: point.y + offset }
  if (position === Position.Right) return { x: point.x - Math.abs(offset), y: point.y + offset }
  if (position === Position.Top) return { x: point.x + offset, y: point.y + Math.abs(offset) }
  if (position === Position.Bottom) return { x: point.x + offset, y: point.y - Math.abs(offset) }
  return { x: point.x + offset, y: point.y }
}

/** Position a cardinality close to its participant endpoint, beside the first
 * segment so the text never floats at the center of a long relationship. */
export function cardinalityLabelPosition(points: RoutePoint[], distance = 28): Point {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 }
  const start = points[0]
  const next = points[1]
  const dx = next.x - start.x
  const dy = next.y - start.y
  const length = Math.hypot(dx, dy) || 1
  const amount = Math.abs(dx) >= Math.abs(dy) ? Math.min(distance, length / 2) : length / 2
  const x = start.x + (dx / length) * amount
  const y = start.y + (dy / length) * amount
  // The label has a padded ~18px line box. A 12px center offset leaves a
  // small visible gap instead of letting its background touch the connector.
  if (Math.abs(dx) >= Math.abs(dy)) return { x, y: y - 12 }
  return { x: x + (dx >= 0 ? 12 : -12), y }
}

export function ConnectorEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, id,
}: EdgeProps<ConnectorEdgeType>) {
  const recursiveOffset = data?.recursiveOffset ?? 0
  const points = orthogonalRoute(
    offsetConnectionPoint({ x: sourceX, y: sourceY }, sourcePosition, recursiveOffset, 'source'),
    offsetConnectionPoint({ x: targetX, y: targetY }, targetPosition, recursiveOffset, 'target'),
    sourcePosition,
    targetPosition,
  )
  const cardinality = data?.connectorKind === 'participant' && data.cardinality
    ? data.cardinalityPending ? '(?)' : cardinalityLabel(data.cardinality)
    : undefined
  const label = cardinality ? cardinalityLabelPosition(points) : undefined

  return (
    <>
      <BaseEdge
        id={id}
        path={routePath(points)}
        interactionWidth={24}
        className={`chen-connector-edge${selected || data?.selected ? ' is-selected' : ''}`}
      />
      {cardinality && label && (
        <EdgeLabelRenderer>
          <span
            className={`chen-cardinality-label nopan${data?.onCardinalityDoubleClick ? ' is-editable' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${label.x}px,${label.y}px)` }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              data?.onCardinalityDoubleClick?.()
            }}
          >
            {cardinality}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
