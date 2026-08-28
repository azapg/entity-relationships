import type { Edge, Node } from '@xyflow/react'
import type { Diagram } from '../domain/types'

export type DiagramNodeKind = 'entity' | 'relationship' | 'attribute'

export type DiagramNodeData = Record<string, unknown> & {
  semanticId: string
  kind: DiagramNodeKind
  label: string
  selected: boolean
}

export type RenderedDiagram = {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
}

export type DiagramRenderer = (diagram: Diagram, selectedId?: string) => RenderedDiagram
