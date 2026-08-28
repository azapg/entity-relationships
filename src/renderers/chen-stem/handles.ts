import { Position } from '@xyflow/react'
import type { AttributeSide } from '../types'

export const STATIC_HANDLE_SIDES: readonly AttributeSide[] = ['north', 'east', 'south', 'west']

export const staticHandleId = (type: 'source' | 'target', side: AttributeSide) =>
  `${type}-${side}`

export const positionForSide = (side: AttributeSide): Position => ({
  north: Position.Top,
  east: Position.Right,
  south: Position.Bottom,
  west: Position.Left,
}[side])

