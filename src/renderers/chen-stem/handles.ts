import { Position } from '@xyflow/react'
import type { AttributeSide } from '../types'

export const STATIC_HANDLE_SIDES: readonly AttributeSide[] = ['north', 'east', 'south', 'west']

export const staticHandleId = (type: 'source' | 'target', side: AttributeSide) =>
  `${type}-${side}`

export const relationshipHandleId = (side: AttributeSide) => `relationship-${side}`

export const relationshipHandleSide = (handleId: string | null | undefined): AttributeSide | undefined => {
  const side = handleId?.replace(/^relationship-/, '')
  return STATIC_HANDLE_SIDES.includes(side as AttributeSide) ? side as AttributeSide : undefined
}

/**
 * Return a handle box whose React Flow connection point lands on the owner
 * boundary. The box can be larger than the visible marker without moving the
 * edge endpoint: top/bottom handles are centered horizontally and left/right
 * handles are centered vertically.
 */
export const connectionHandleBox = (
  side: AttributeSide,
  width: number,
  height: number,
  size: number,
  inset = 0,
) => {
  const x = side === 'east' ? width - inset : side === 'west' ? inset : width / 2
  const y = side === 'south' ? height - inset : side === 'north' ? inset : height / 2
  return {
    left: side === 'east' ? x - size : side === 'west' ? x : x - size / 2,
    top: side === 'south' ? y - size : side === 'north' ? y : y - size / 2,
    width: size,
    height: size,
  }
}

export const positionForSide = (side: AttributeSide): Position => ({
  north: Position.Top,
  east: Position.Right,
  south: Position.Bottom,
  west: Position.Left,
}[side])
