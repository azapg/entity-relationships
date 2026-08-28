export type Point = { x: number; y: number }

export type Cardinality = {
  min: 0 | 1
  max: 1 | 'n'
}

export type Attribute = {
  id: string
  name: string
  key: boolean
}

export type Entity = {
  id: string
  name: string
  kind: 'strong' | 'weak'
  attributes: Attribute[]
}

export type Participant = {
  entityId: string
  cardinality: Cardinality
}

export type Relationship = {
  id: string
  name: string
  participants: Participant[]
  attributes: Attribute[]
}

export type CustomTheme = {
  background: string
  entity: string
  relationship: string
  ink: string
  font: 'serif' | 'sans'
}

export type DiagramView = {
  renderer: 'chen-stem'
  theme: 'academic' | 'warm' | 'modern' | 'custom'
  positions: Record<string, Point>
  customTheme?: CustomTheme
}

export type Diagram = {
  id: string
  name: string
  entities: Entity[]
  relationships: Relationship[]
  view: DiagramView
}

export type SemanticSelection =
  | { type: 'entity'; id: string }
  | { type: 'relationship'; id: string }
  | null

export const cardinalityLabel = ({ min, max }: Cardinality) =>
  `(${min},${max})`
