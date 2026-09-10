import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
export type RelationalEdgeData = { label?: string; sourceColumnId?: string; targetColumnId?: string }
type RelationalEdge = Edge<RelationalEdgeData>
export function ForeignKeyEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd }: EdgeProps<RelationalEdge>) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  return <>
    <BaseEdge path={path} markerEnd={markerEnd} className="relational-fk-edge" />
  </>
}
