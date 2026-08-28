import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'
import type { Cardinality } from '../../domain/types'
import { cardinalityLabel } from '../../domain/types'

type ConnectorData = {
  connectorKind?: 'participant' | 'attribute'
  cardinality?: Cardinality
  lane?: 'north' | 'east' | 'south' | 'west'
  sourceKind?: 'entity' | 'relationship'
  selected?: boolean
}

/** One edge implementation handles both owner-to-attribute stems and participants. */
export function ConnectorEdge({
  sourceX, sourceY, targetX, targetY, data, selected, id,
}: EdgeProps & { data?: ConnectorData }) {
  const from = { x: sourceX, y: sourceY }
  const to = { x: targetX, y: targetY }
  // Handles are intentionally invisible, but provide precise, stable endpoints.
  // Keeping this fallback makes the edge useful in static snapshots too.
  const start = from
  const end = to
  const path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  const labelX = start.x + (end.x - start.x) * 0.22
  const labelY = start.y + (end.y - start.y) * 0.22
  const cardinality = data?.cardinality ? cardinalityLabel(data.cardinality) : undefined

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={24}
        className={`chen-connector-edge${selected || data?.selected ? ' is-selected' : ''}`}
      />
      {cardinality && (
        <EdgeLabelRenderer>
          <span
            className="chen-cardinality-label nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          >
            {cardinality}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
