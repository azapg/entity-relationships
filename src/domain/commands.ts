import type {
  Attribute,
  Cardinality,
  Diagram,
  Entity,
  Participant,
  Point,
  Relationship,
} from './types'
import {
  ensureAttributeLayout,
  reflowAttributeLayout,
  snapMajorPositions,
  snapPoint,
} from './layout'

/**
 * The functions in this file are deliberately UI-agnostic.  A React Flow
 * graph is a projection of these operations; it is never the source of truth.
 */

export type AttributeOwner = 'entity' | 'relationship'

export type AttributePatch = Partial<Pick<Attribute, 'name' | 'key' | 'multivalued' | 'components'>>

const cleanName = (name: string, fallback: string) => name.trim() || fallback

const entityIndex = (diagram: Diagram, id: string) =>
  diagram.entities.findIndex((entity) => entity.id === id)

const relationshipIndex = (diagram: Diagram, id: string) =>
  diagram.relationships.findIndex((relationship) => relationship.id === id)

const updateEntityAt = (
  diagram: Diagram,
  index: number,
  update: (entity: Entity) => Entity,
): Diagram => ({
  ...diagram,
  entities: diagram.entities.map((entity, currentIndex) =>
    currentIndex === index ? update(entity) : entity,
  ),
})

const updateRelationshipAt = (
  diagram: Diagram,
  index: number,
  update: (relationship: Relationship) => Relationship,
): Diagram => ({
  ...diagram,
  relationships: diagram.relationships.map((relationship, currentIndex) =>
    currentIndex === index ? update(relationship) : relationship,
  ),
})

const withAttributeLayout = (diagram: Diagram): Diagram => ({
  ...diagram,
  view: { ...diagram.view, attributeLayout: ensureAttributeLayout(diagram) },
})

const withoutAttributeLayout = (diagram: Diagram, attributeId: string): Diagram => {
  const attributeLayout = { ...diagram.view.attributeLayout }
  delete attributeLayout[attributeId]
  return { ...diagram, view: { ...diagram.view, attributeLayout } }
}

export const setDiagramName = (diagram: Diagram, name: string): Diagram => ({
  ...diagram,
  name: cleanName(name, 'Sin título'),
})

export const insertEntity = (
  diagram: Diagram,
  entity: Entity,
  position: Point,
): Diagram => ({
  ...diagram,
  entities: [...diagram.entities, entity],
  view: {
    ...diagram.view,
    positions: {
      ...diagram.view.positions,
      [entity.id]: diagram.view.layoutMode === 'structured' ? snapPoint(position) : position,
    },
    attributeLayout: { ...diagram.view.attributeLayout },
  },
})

export const renameEntity = (
  diagram: Diagram,
  id: string,
  name: string,
): Diagram => {
  const index = entityIndex(diagram, id)
  return index < 0
    ? diagram
    : updateEntityAt(diagram, index, (entity) => ({
        ...entity,
        name: cleanName(name, 'Sin nombre'),
      }))
}

export const setEntityKind = (
  diagram: Diagram,
  id: string,
  kind: Entity['kind'],
): Diagram => {
  const index = entityIndex(diagram, id)
  return index < 0
    ? diagram
    : updateEntityAt(diagram, index, (entity) => ({ ...entity, kind }))
}

/** Removing an entity also removes every relationship that participates in it. */
export const removeEntity = (diagram: Diagram, id: string): Diagram => {
  if (entityIndex(diagram, id) < 0) return diagram

  const removedRelationshipIds = new Set(
    diagram.relationships
      .filter((relationship) =>
        relationship.participants.some((participant) => participant.entityId === id),
      )
      .map((relationship) => relationship.id),
  )

  const positions = { ...diagram.view.positions }
  const attributeLayout = { ...diagram.view.attributeLayout }
  const pendingCardinalities = { ...diagram.view.pendingCardinalities }
  delete positions[id]
  removedRelationshipIds.forEach((relationshipId) => {
    delete positions[relationshipId]
    delete pendingCardinalities[relationshipId]
  })
  diagram.entities
    .find((entity) => entity.id === id)
    ?.attributes.forEach((attribute) => delete attributeLayout[attribute.id])
  diagram.relationships
    .filter((relationship) => removedRelationshipIds.has(relationship.id))
    .flatMap((relationship) => relationship.attributes)
    .forEach((attribute) => delete attributeLayout[attribute.id])

  return {
    ...diagram,
    entities: diagram.entities.filter((entity) => entity.id !== id),
    relationships: diagram.relationships.filter(
      (relationship) => !removedRelationshipIds.has(relationship.id),
    ),
    view: {
      ...diagram.view,
      positions,
      attributeLayout,
      ...(Object.keys(pendingCardinalities).length
        ? { pendingCardinalities }
        : { pendingCardinalities: undefined }),
    },
  }
}

export const appendAttribute = (
  diagram: Diagram,
  ownerType: AttributeOwner,
  ownerId: string,
  attribute: Attribute,
): Diagram => {
  if (ownerType === 'entity') {
    const index = entityIndex(diagram, ownerId)
    if (index < 0) return diagram
    return withAttributeLayout(updateEntityAt(diagram, index, (entity) => ({
      ...entity,
      attributes: [...entity.attributes, attribute],
    })))
  }

  const index = relationshipIndex(diagram, ownerId)
  if (index < 0) return diagram
  return withAttributeLayout(updateRelationshipAt(diagram, index, (relationship) => ({
    ...relationship,
    attributes: [...relationship.attributes, attribute],
  })))
}

export const patchAttribute = (
  diagram: Diagram,
  ownerType: AttributeOwner,
  ownerId: string,
  attributeId: string,
  patch: AttributePatch,
): Diagram => {
  const update = (attributes: Attribute[]) =>
    attributes.map((attribute) =>
      attribute.id === attributeId
        ? {
            ...attribute,
            ...(patch.name === undefined ? {} : { name: cleanName(patch.name, 'Sin nombre') }),
            ...(patch.key === undefined ? {} : { key: patch.key }),
            ...(patch.multivalued === undefined ? {} : { multivalued: patch.multivalued }),
            ...(patch.components === undefined ? {} : { components: patch.components }),
          }
        : attribute,
    )

  if (ownerType === 'entity') {
    const index = entityIndex(diagram, ownerId)
    return index < 0
      ? diagram
      : updateEntityAt(diagram, index, (entity) => ({
          ...entity,
          attributes: update(entity.attributes),
        }))
  }

  const index = relationshipIndex(diagram, ownerId)
  return index < 0
    ? diagram
    : updateRelationshipAt(diagram, index, (relationship) => ({
        ...relationship,
        attributes: update(relationship.attributes),
      }))
}

export const removeAttribute = (
  diagram: Diagram,
  ownerType: AttributeOwner,
  ownerId: string,
  attributeId: string,
): Diagram => {
  if (ownerType === 'entity') {
    const index = entityIndex(diagram, ownerId)
    if (index < 0) return diagram
    return withoutAttributeLayout(updateEntityAt(diagram, index, (entity) => ({
      ...entity,
      attributes: entity.attributes.filter((attribute) => attribute.id !== attributeId),
    })), attributeId)
  }

  const index = relationshipIndex(diagram, ownerId)
  if (index < 0) return diagram
  return withoutAttributeLayout(updateRelationshipAt(diagram, index, (relationship) => ({
    ...relationship,
    attributes: relationship.attributes.filter((attribute) => attribute.id !== attributeId),
  })), attributeId)
}

export const insertRelationship = (
  diagram: Diagram,
  relationship: Relationship,
  position: Point,
  options: { cardinalitiesPending?: boolean } = {},
): Diagram => ({
  ...diagram,
  relationships: [...diagram.relationships, relationship],
  view: {
    ...diagram.view,
    positions: {
      ...diagram.view.positions,
      [relationship.id]: diagram.view.layoutMode === 'structured' ? snapPoint(position) : position,
    },
    attributeLayout: { ...diagram.view.attributeLayout },
    ...(options.cardinalitiesPending
      ? { pendingCardinalities: { ...diagram.view.pendingCardinalities, [relationship.id]: true } }
      : {}),
  },
})

/** Insert the two majors and their semantic relationship as one operation. */
export const insertEntityAndRelationship = (
  diagram: Diagram,
  entity: Entity,
  relationship: Relationship,
  entityPosition: Point,
  relationshipPosition: Point,
  options: { cardinalitiesPending?: boolean } = {},
): Diagram => insertRelationship(
  insertEntity(diagram, entity, entityPosition),
  relationship,
  relationshipPosition,
  options,
)

export const renameRelationship = (
  diagram: Diagram,
  id: string,
  name: string,
): Diagram => {
  const index = relationshipIndex(diagram, id)
  return index < 0
    ? diagram
    : updateRelationshipAt(diagram, index, (relationship) => ({
        ...relationship,
        name: cleanName(name, 'Sin nombre'),
      }))
}

export const patchParticipant = (
  diagram: Diagram,
  relationshipId: string,
  entityId: string,
  cardinality: Cardinality,
  participantIndex?: number,
): Diagram => {
  const index = relationshipIndex(diagram, relationshipId)
  if (index < 0) return diagram
  const pendingCardinalities = { ...diagram.view.pendingCardinalities }
  delete pendingCardinalities[relationshipId]
  const next = updateRelationshipAt(diagram, index, (relationship) => ({
        ...relationship,
        participants: relationship.participants.map((participant, index) =>
          (participantIndex === index || (participantIndex === undefined && participant.entityId === entityId))
            ? { ...participant, cardinality }
            : participant,
        ),
      }))
  return {
    ...next,
    view: {
      ...next.view,
      ...(Object.keys(pendingCardinalities).length
        ? { pendingCardinalities }
        : { pendingCardinalities: undefined }),
    },
  }
}

export const removeRelationship = (diagram: Diagram, id: string): Diagram => {
  if (relationshipIndex(diagram, id) < 0) return diagram
  const positions = { ...diagram.view.positions }
  const attributeLayout = { ...diagram.view.attributeLayout }
  const pendingCardinalities = { ...diagram.view.pendingCardinalities }
  delete positions[id]
  delete pendingCardinalities[id]
  diagram.relationships.find((relationship) => relationship.id === id)?.attributes
    .forEach((attribute) => delete attributeLayout[attribute.id])
  return {
    ...diagram,
    relationships: diagram.relationships.filter((relationship) => relationship.id !== id),
    view: {
      ...diagram.view,
      positions,
      attributeLayout,
      ...(Object.keys(pendingCardinalities).length
        ? { pendingCardinalities }
        : { pendingCardinalities: undefined }),
    },
  }
}

export const moveItem = (diagram: Diagram, id: string, position: Point): Diagram => {
  if (!diagram.entities.some((entity) => entity.id === id)
    && !diagram.relationships.some((relationship) => relationship.id === id)) return diagram
  return {
    ...diagram,
    view: {
      ...diagram.view,
      positions: {
        ...diagram.view.positions,
        [id]: diagram.view.layoutMode === 'structured' ? snapPoint(position) : position,
      },
    },
  }
}

export const setLayoutMode = (
  diagram: Diagram,
  mode: Diagram['view']['layoutMode'],
): Diagram => ({
  ...diagram,
  view: {
    ...diagram.view,
    layoutMode: mode,
    positions: mode === 'structured' ? snapMajorPositions(diagram) : { ...diagram.view.positions },
  },
})

export const reflowAttributes = (diagram: Diagram): Diagram => ({
  ...diagram,
  view: { ...diagram.view, attributeLayout: reflowAttributeLayout(diagram) },
})

export const setDiagramTheme = (
  diagram: Diagram,
  theme: Diagram['view']['theme'],
): Diagram => ({
  ...diagram,
  view: { ...diagram.view, theme },
})

export const patchCustomTheme = (
  diagram: Diagram,
  patch: Partial<NonNullable<Diagram['view']['customTheme']>>,
): Diagram => ({
  ...diagram,
  view: {
    ...diagram.view,
    theme: 'custom',
    customTheme: { ...diagram.view.customTheme, ...patch } as NonNullable<Diagram['view']['customTheme']>,
  },
})

/** A defensive clone used at the persistence boundary and by tests. */
export const cloneDiagram = (diagram: Diagram): Diagram => ({
  ...diagram,
  entities: diagram.entities.map((entity) => ({
    ...entity,
    attributes: entity.attributes.map((attribute) => ({ ...attribute })),
  })),
  relationships: diagram.relationships.map((relationship) => ({
    ...relationship,
    participants: relationship.participants.map((participant) => ({
      ...participant,
      cardinality: { ...participant.cardinality },
    })),
    attributes: relationship.attributes.map((attribute) => ({ ...attribute })),
  })),
  view: {
    ...diagram.view,
    positions: Object.fromEntries(
      Object.entries(diagram.view.positions).map(([id, point]) => [id, { ...point }]),
    ),
    attributeLayout: Object.fromEntries(
      Object.entries(diagram.view.attributeLayout ?? {}).map(([id, assignment]) => [
        id,
        { ...assignment },
      ]),
    ),
    ...(diagram.view.pendingCardinalities
      ? { pendingCardinalities: { ...diagram.view.pendingCardinalities } }
      : {}),
    ...(diagram.view.customTheme
      ? { customTheme: { ...diagram.view.customTheme } }
      : {}),
  },
})

export const participantExists = (participants: Participant[], entityId: string) =>
  participants.some((participant) => participant.entityId === entityId)
