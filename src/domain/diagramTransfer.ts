import type { Attribute, Diagram } from './types'

export const DIAGRAM_FILE_FORMAT = 'nightingale-schema'
export const DIAGRAM_FILE_VERSION = 1
export const MAX_DIAGRAM_FILE_BYTES = 5 * 1024 * 1024

type DiagramFile = {
  format: typeof DIAGRAM_FILE_FORMAT
  version: typeof DIAGRAM_FILE_VERSION
  diagram: Diagram
}

export class DiagramImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiagramImportError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isPoint = (value: unknown) => isRecord(value)
  && typeof value.x === 'number' && Number.isFinite(value.x)
  && typeof value.y === 'number' && Number.isFinite(value.y)

function collectAttributeIds(value: unknown, ids: Set<string>): value is Attribute[] {
  if (!Array.isArray(value)) return false
  return value.every((attribute) => {
    if (!isRecord(attribute) || !isText(attribute.id) || !isText(attribute.name)
      || typeof attribute.key !== 'boolean' || ids.has(attribute.id)) return false
    if (attribute.multivalued !== undefined && typeof attribute.multivalued !== 'boolean') return false
    ids.add(attribute.id)
    return attribute.components === undefined || collectAttributeIds(attribute.components, ids)
  })
}

function isDiagram(value: unknown): value is Diagram {
  if (!isRecord(value) || !isText(value.id) || !isText(value.name)
    || !Array.isArray(value.entities) || !Array.isArray(value.relationships)
    || (value.generalizations !== undefined && !Array.isArray(value.generalizations))
    || !isRecord(value.view)) return false

  const ids = new Set<string>()
  const entityIds = new Set<string>()
  const attributeIds = new Set<string>()
  const entitiesValid = value.entities.every((entity) => {
    if (!isRecord(entity) || !isText(entity.id) || !isText(entity.name)
      || (entity.kind !== 'strong' && entity.kind !== 'weak') || ids.has(entity.id)) return false
    ids.add(entity.id)
    entityIds.add(entity.id)
    return collectAttributeIds(entity.attributes, attributeIds)
  })
  if (!entitiesValid) return false

  const relationshipIds = new Set<string>()
  const relationshipsValid = value.relationships.every((relationship) => {
    if (!isRecord(relationship) || !isText(relationship.id) || !isText(relationship.name)
      || ids.has(relationship.id) || !Array.isArray(relationship.participants)
      || relationship.participants.length < 2) return false
    ids.add(relationship.id)
    relationshipIds.add(relationship.id)
    return relationship.participants.every((participant) => isRecord(participant)
      && isText(participant.entityId) && entityIds.has(participant.entityId)
      && isRecord(participant.cardinality)
      && (participant.cardinality.min === 0 || participant.cardinality.min === 1)
      && (participant.cardinality.max === 1 || participant.cardinality.max === 'n'))
      && collectAttributeIds(relationship.attributes, attributeIds)
  })
  if (!relationshipsValid || [...attributeIds].some((id) => ids.has(id))) return false
  attributeIds.forEach((id) => ids.add(id))

  const generalizationIds = new Set<string>()
  const generalizationsValid = (value.generalizations ?? []).every((generalization) => {
    if (!isRecord(generalization) || !isText(generalization.id) || ids.has(generalization.id)
      || !isText(generalization.supertypeId) || !entityIds.has(generalization.supertypeId)
      || !Array.isArray(generalization.subtypeIds) || generalization.subtypeIds.length === 0
      || generalization.completeness !== 'total' && generalization.completeness !== 'partial'
      || generalization.disjointness !== 'exclusive' && generalization.disjointness !== 'overlapping') return false
    const subtypeIds = generalization.subtypeIds
    if (!subtypeIds.every((id): id is string => isText(id) && entityIds.has(id) && id !== generalization.supertypeId)
      || new Set(subtypeIds).size !== subtypeIds.length) return false
    ids.add(generalization.id)
    generalizationIds.add(generalization.id)
    return true
  })
  if (!generalizationsValid) return false

  const view = value.view
  const themeValid = ['academic', 'warm', 'modern', 'custom'].includes(String(view.theme))
  const layoutValid = view.layoutMode === 'structured' || view.layoutMode === 'freeform'
  const cardinalityPlacementValid = view.cardinalityPlacement === undefined
    || view.cardinalityPlacement === 'near-entity'
    || view.cardinalityPlacement === 'opposite-entity'
  if (view.renderer !== 'chen-stem' || !themeValid || !layoutValid
    || !cardinalityPlacementValid || !isRecord(view.positions) || !isRecord(view.attributeLayout)) return false
  if (!Object.entries(view.positions).every(([id, point]) =>
    (entityIds.has(id) || relationshipIds.has(id) || generalizationIds.has(id)) && isPoint(point))) return false
  if (!Object.entries(view.attributeLayout).every(([id, layout]) =>
    attributeIds.has(id) && isRecord(layout) && ['north', 'east', 'south', 'west'].includes(String(layout.side)))) return false
  if (view.pendingCardinalities !== undefined
    && (!isRecord(view.pendingCardinalities) || !Object.entries(view.pendingCardinalities)
      .every(([id, pending]) => relationshipIds.has(id) && pending === true))) return false
  if (view.customTheme !== undefined) {
    const custom = view.customTheme
    const color = (candidate: unknown) => typeof candidate === 'string' && /^#[0-9a-f]{6}$/i.test(candidate)
    if (!isRecord(custom) || !color(custom.background) || !color(custom.entity)
      || !color(custom.relationship) || !color(custom.ink)
      || (custom.font !== 'serif' && custom.font !== 'sans')) return false
  }
  return true
}

export function serializeDiagramFile(diagram: Diagram) {
  const payload: DiagramFile = {
    format: DIAGRAM_FILE_FORMAT,
    version: DIAGRAM_FILE_VERSION,
    diagram,
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function parseDiagramFile(source: string): Diagram {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new DiagramImportError('El archivo no contiene JSON válido.')
  }
  if (!isRecord(value) || value.format !== DIAGRAM_FILE_FORMAT) {
    throw new DiagramImportError('Este archivo no es un diagrama de Nightingale Schema.')
  }
  if (value.version !== DIAGRAM_FILE_VERSION) {
    throw new DiagramImportError('Esta versión del archivo todavía no es compatible.')
  }
  if (!isDiagram(value.diagram)) {
    throw new DiagramImportError('El diagrama está incompleto o contiene datos no válidos.')
  }
  const diagram = structuredClone(value.diagram)
  return { ...diagram, generalizations: diagram.generalizations ?? [] }
}
