import type { Edge, Node } from '@xyflow/react'
import type { Diagram } from '../domain/types'

/** The four sides used by the Chen stem renderer. Kept here as a renderer
 * contract so the projection can remain independent of the semantic model. */
export type AttributeSide = 'north' | 'east' | 'south' | 'west'

export type AttributeHandleLayout = {
  id: string
  side: AttributeSide
  /** Local owner coordinates of the exact visible attachment point. */
  x: number
  y: number
  /** Axis offset retained for inspection/debugging. */
  offset: number
}

export type DiagramNodeKind = 'entity' | 'relationship' | 'attribute'

export type DiagramNodeData = Record<string, unknown> & {
  semanticId: string
  kind: DiagramNodeKind
  label: string
  selected: boolean
  /** Renderer-only metadata. Attribute positions are derived from this. */
  ownerId?: string
  ownerKind?: 'entity' | 'relationship'
  side?: AttributeSide
  lane?: AttributeSide
  attributeHandles?: AttributeHandleLayout[]
  width?: number
  height?: number
}

export type RenderedDiagram = {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
}

export type DiagramRenderer = (diagram: Diagram, selectedId?: string) => RenderedDiagram
