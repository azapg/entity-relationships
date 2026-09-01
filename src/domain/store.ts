import { create } from 'zustand'
import {
  appendAttribute,
  cloneDiagram,
  insertEntityAndRelationship,
  insertEntity,
  insertRelationship,
  moveItem,
  patchAttribute,
  patchCustomTheme,
  patchParticipant,
  removeAttribute,
  removeEntity,
  removeRelationship,
  renameEntity as renameEntityCommand,
  renameRelationship as renameRelationshipCommand,
  setDiagramName as setDiagramNameCommand,
  setDiagramTheme,
  setEntityKind as setEntityKindCommand,
  setLayoutMode as setLayoutModeCommand,
  reflowAttributes as reflowAttributesCommand,
  type AttributeOwner,
  type AttributePatch,
} from './commands'
import {
  ensureAttributeLayout,
  normalizeLayoutMode,
  relationshipPositionBetween,
  snapMajorPositions,
} from './layout'
import { createBlankDiagram, createSampleDiagram } from './sample'
import type {
  Attribute,
  AttributeSide,
  Cardinality,
  CustomTheme,
  Diagram,
  Entity,
  Participant,
  Point,
  Relationship,
  SemanticSelection,
  LayoutMode,
} from './types'

export const STORAGE_KEY = 'er-diagram:v1'
export const STORAGE_VERSION = 1
export const DIAGRAMS_STORAGE_KEY = 'er-diagrams:v1'
export const DIAGRAMS_STORAGE_VERSION = 1

type PersistedDiagram = {
  version: typeof STORAGE_VERSION
  diagram: Diagram
}

type PersistedDiagrams = {
  version: typeof DIAGRAMS_STORAGE_VERSION
  diagrams: Diagram[]
}

type HistoryState = {
  past: Diagram[]
  future: Diagram[]
}

export type DiagramStore = {
  diagram: Diagram
  diagrams: Diagram[]
  selection: SemanticSelection
  canUndo: boolean
  canRedo: boolean
  setSelection: (selection: SemanticSelection) => void
  openDiagram: (id: string) => boolean
  createDiagram: () => string
  setDiagramName: (name: string) => void
  createEntity: (name: string, kind?: Entity['kind'], position?: Point) => string
  renameEntity: (id: string, name: string) => void
  setEntityKind: (id: string, kind: Entity['kind']) => void
  deleteEntity: (id: string) => void
  addAttribute: (
    ownerType: AttributeOwner,
    ownerId: string,
    name: string,
    key?: boolean,
    componentNames?: string[],
    multivalued?: boolean,
  ) => string
  updateAttribute: (
    ownerType: AttributeOwner,
    ownerId: string,
    attributeId: string,
    patch: AttributePatch,
  ) => void
  deleteAttribute: (
    ownerType: AttributeOwner,
    ownerId: string,
    attributeId: string,
  ) => void
  createRelationship: (
    name: string,
    participants: Participant[],
    position?: Point,
  ) => string
  createRelationshipFlow: (
    sourceEntityId: string,
    target: string | { name?: string; kind?: Entity['kind']; position?: Point },
    name: string,
    options?: {
      position?: Point
      sourceSide?: AttributeSide
      cardinalities?: [Cardinality, Cardinality]
      cardinalitiesPending?: boolean
    },
  ) => { entityId: string; relationshipId: string } | null
  renameRelationship: (id: string, name: string) => void
  updateParticipant: (
    relationshipId: string,
    entityId: string,
    cardinality: Cardinality,
    participantIndex?: number,
  ) => void
  deleteRelationship: (id: string) => void
  setPosition: (id: string, point: Point) => void
  setLayoutMode: (mode: LayoutMode) => void
  reflowAttributes: () => void
  setTheme: (theme: Diagram['view']['theme']) => void
  updateCustomTheme: (patch: Partial<CustomTheme>) => void
  resetDiagram: (mode?: 'blank' | 'sample') => void
  undo: () => void
  redo: () => void
}

type InternalStore = DiagramStore & HistoryState

const getStorage = (): Storage | undefined => {
  try {
    return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage
  } catch {
    return undefined
  }
}

const isDiagram = (value: unknown): value is Diagram => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Diagram>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.entities) &&
    Array.isArray(candidate.relationships) &&
    Boolean(candidate.view) &&
    typeof candidate.view === 'object' &&
    candidate.view.renderer === 'chen-stem' &&
    typeof candidate.view.positions === 'object'
  )
}

const uniqueDiagrams = (diagrams: Diagram[]) => {
  const seen = new Set<string>()
  return diagrams.filter((diagram) => {
    if (seen.has(diagram.id)) return false
    seen.add(diagram.id)
    return true
  })
}

type LegacySampleLabel = {
  legacy: string
  localized: string
}

/**
 * Labels used by the original built-in sample. The IDs are intentionally
 * stable so existing persisted samples can be localized without touching a
 * user's positions, theme, or custom names.
 */
const LEGACY_SAMPLE_LABELS: Record<string, LegacySampleLabel> = {
  'sample-student': { legacy: 'STUDENT', localized: 'ESTUDIANTE' },
  'sample-student-id': { legacy: 'student_id', localized: 'estudiante_id' },
  'sample-student-name': { legacy: 'name', localized: 'nombre' },
  'sample-course': { legacy: 'COURSE', localized: 'CURSO' },
  'sample-course-id': { legacy: 'course_id', localized: 'curso_id' },
  'sample-course-title': { legacy: 'title', localized: 'título' },
  'sample-enrolls': { legacy: 'ENROLLS', localized: 'INSCRIBE' },
  'sample-grade': { legacy: 'grade', localized: 'calificación' },
}

const migrateLegacySample = (diagram: Diagram): boolean => {
  if (diagram.id !== 'sample-diagram') return false

  let migrated = false
  const localize = (item: { id: string; name: string }) => {
    const labels = LEGACY_SAMPLE_LABELS[item.id]
    if (!labels || item.name !== labels.legacy) return
    item.name = labels.localized
    migrated = true
  }

  diagram.entities.forEach((entity) => {
    localize(entity)
    entity.attributes.forEach(localize)
  })
  diagram.relationships.forEach((relationship) => {
    localize(relationship)
    relationship.attributes.forEach(localize)
  })

  return migrated
}

/** Add view-only fields to diagrams written by older versions. */
export const normalizeDiagram = (diagram: Diagram): Diagram => {
  const legacyView = diagram.view as Diagram['view'] & {
    layoutMode?: unknown
    attributeLayout?: unknown
  }
  const attributeLayout = legacyView.attributeLayout && typeof legacyView.attributeLayout === 'object'
    ? legacyView.attributeLayout as Diagram['view']['attributeLayout']
    : {}
  const layoutMode = normalizeLayoutMode(legacyView.layoutMode)
  const candidate = {
    ...diagram,
    view: {
      ...diagram.view,
      layoutMode,
      attributeLayout,
    },
  }
  const attributeIds = new Set([
    ...diagram.entities.flatMap((entity) => entity.attributes.map((attribute) => attribute.id)),
    ...diagram.relationships.flatMap((relationship) =>
      relationship.attributes.map((attribute) => attribute.id)),
  ])
  const positions = layoutMode === 'freeform'
    ? { ...diagram.view.positions }
    : snapMajorPositions(candidate)
  const relationshipIds = new Set(diagram.relationships.map((relationship) => relationship.id))
  const pendingCardinalities = diagram.view.pendingCardinalities
    ? Object.fromEntries(Object.entries(diagram.view.pendingCardinalities)
      .filter(([id, pending]) => relationshipIds.has(id) && pending === true)) as Record<string, true>
    : undefined
  return {
    ...candidate,
    view: {
      ...candidate.view,
      // Structured diagrams retain a canonical grid position; freeform
      // diagrams retain the user's exact coordinates.
      positions: Object.fromEntries(Object.entries(positions)
        .filter(([id]) => !attributeIds.has(id))),
      attributeLayout: ensureAttributeLayout(candidate),
      ...(pendingCardinalities && Object.keys(pendingCardinalities).length
        ? { pendingCardinalities }
        : {}),
    },
  }
}

export const readPersistedDiagram = (): Diagram | undefined => {
  const storage = getStorage()
  if (!storage) return undefined
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return undefined
    const payload = parsed as Partial<PersistedDiagram>
    if (payload.version !== STORAGE_VERSION || !isDiagram(payload.diagram)) return undefined
    const diagram = normalizeDiagram(cloneDiagram(payload.diagram))
    // Persist normalization so a legacy payload is upgraded on first read.
    // This also writes localized built-in sample labels when applicable.
    migrateLegacySample(diagram)
    persistDiagram(diagram)
    return diagram
  } catch {
    // A malformed or unavailable localStorage should never prevent the editor
    // from opening with the sample diagram.
    return undefined
  }
}

const readPersistedLibrary = (): Diagram[] | undefined => {
  const storage = getStorage()
  if (!storage) return undefined
  try {
    const raw = storage.getItem(DIAGRAMS_STORAGE_KEY)
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return undefined
    const payload = parsed as Partial<PersistedDiagrams>
    if (payload.version !== DIAGRAMS_STORAGE_VERSION || !Array.isArray(payload.diagrams)) return undefined
    const diagrams = uniqueDiagrams(payload.diagrams
      .filter(isDiagram)
      .map((diagram) => {
        const next = normalizeDiagram(cloneDiagram(diagram))
        migrateLegacySample(next)
        return next
      }))
    return diagrams.length ? diagrams : undefined
  } catch {
    return undefined
  }
}

export const readPersistedDiagrams = (): Diagram[] =>
  readPersistedLibrary() ?? (() => {
    const diagram = readPersistedDiagram()
    return diagram ? [diagram] : []
  })()

export const persistDiagrams = (diagrams: Diagram[]) => {
  const storage = getStorage()
  if (!storage) return
  try {
    const normalized = uniqueDiagrams(diagrams.map((diagram) => {
      const next = normalizeDiagram(cloneDiagram(diagram))
      migrateLegacySample(next)
      return next
    }))
    if (!normalized.length) return
    const payload: PersistedDiagrams = {
      version: DIAGRAMS_STORAGE_VERSION,
      diagrams: normalized,
    }
    storage.setItem(DIAGRAMS_STORAGE_KEY, JSON.stringify(payload))
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      diagram: normalized[0],
    } satisfies PersistedDiagram))
  } catch {
    // Persistence is a convenience; private browsing and quota errors are safe to ignore.
  }
}

export const persistDiagram = (diagram: Diagram) => {
  const storage = getStorage()
  if (!storage) return
  try {
    const next = normalizeDiagram(cloneDiagram(diagram))
    migrateLegacySample(next)
    const existing = readPersistedLibrary() ?? []
    persistDiagrams([next, ...existing.filter((item) => item.id !== next.id)])
  } catch {
    // Persistence is a convenience; private browsing and quota errors are safe to ignore.
  }
}

const makeId = (prefix: string) => {
  try {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`
  } catch {
    // Fall through for older browsers and test environments.
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

const defaultEntityPosition = (count: number): Point => ({
  x: 160 + (count % 3) * 300,
  y: 150 + Math.floor(count / 3) * 220,
})

const defaultRelationshipPosition = (diagram: Diagram): Point => ({
  x: 260 + diagram.relationships.length * 260,
  y: 260 + (diagram.relationships.length % 2) * 120,
})

const unspecifiedCardinality = (): Cardinality => ({ min: 0, max: 'n' })

const selectionStillExists = (selection: SemanticSelection, diagram: Diagram) => {
  if (!selection) return true
  return selection.type === 'entity'
    ? diagram.entities.some((entity) => entity.id === selection.id)
    : diagram.relationships.some((relationship) => relationship.id === selection.id)
}

const initialDiagrams = readPersistedDiagrams()
const initialDiagram = initialDiagrams[0] ?? normalizeDiagram(createSampleDiagram())
const initialLibrary = initialDiagrams.length ? initialDiagrams : [initialDiagram]

const putDiagramFirst = (diagrams: Diagram[], diagram: Diagram) => [
  diagram,
  ...diagrams.filter((item) => item.id !== diagram.id),
]

export const useDiagramStore = create<InternalStore>((set, get) => {
  const commit = (next: Diagram) => {
    const current = get().diagram
    if (next === current) return false
    const selection = get().selection
    const diagrams = putDiagramFirst(get().diagrams, next)
    set((state) => ({
      diagram: next,
      diagrams,
      past: [...state.past, current],
      future: [],
      canUndo: true,
      canRedo: false,
      selection: selectionStillExists(selection, next) ? selection : null,
    }))
    persistDiagrams(diagrams)
    return true
  }

  const commitWithoutHistory = (next: Diagram) => {
    if (next === get().diagram) return false
    const diagrams = putDiagramFirst(get().diagrams, next)
    set({ diagram: next, diagrams })
    persistDiagrams(diagrams)
    return true
  }

  return {
    diagram: initialDiagram,
    diagrams: initialLibrary,
    selection: null,
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,

    setSelection: (selection) => {
      if (selectionStillExists(selection, get().diagram)) set({ selection })
    },

    openDiagram: (id) => {
      const state = get()
      const next = state.diagrams.find((item) => item.id === id)
      if (!next) return false
      const diagrams = putDiagramFirst(state.diagrams, next)
      set({
        diagram: cloneDiagram(next),
        diagrams,
        selection: null,
        past: [],
        future: [],
        canUndo: false,
        canRedo: false,
      })
      persistDiagrams(diagrams)
      return true
    },

    createDiagram: () => {
      const next = createBlankDiagram()
      const diagrams = putDiagramFirst(get().diagrams, next)
      set({
        diagram: next,
        diagrams,
        selection: null,
        past: [],
        future: [],
        canUndo: false,
        canRedo: false,
      })
      persistDiagrams(diagrams)
      return next.id
    },

    setDiagramName: (name) => {
      commit(setDiagramNameCommand(get().diagram, name))
    },

    createEntity: (name, kind = 'strong', position) => {
      const id = makeId('entity')
      const entity: Entity = { id, name: name.trim() || 'Sin nombre', kind, attributes: [] }
      commit(insertEntity(get().diagram, entity, position ?? defaultEntityPosition(get().diagram.entities.length)))
      return id
    },

    renameEntity: (id, name) => {
      commit(renameEntityCommand(get().diagram, id, name))
    },

    setEntityKind: (id, kind) => {
      commit(setEntityKindCommand(get().diagram, id, kind))
    },

    deleteEntity: (id) => {
      commit(removeEntity(get().diagram, id))
    },

    addAttribute: (ownerType, ownerId, name, key = false, componentNames = [], multivalued = false) => {
      const id = makeId('attribute')
      const components = componentNames
        .map((componentName) => componentName.trim())
        .filter(Boolean)
        .map((componentName) => ({ id: makeId('attribute'), name: componentName, key: false }))
      const attribute: Attribute = {
        id,
        name: name.trim() || 'Sin nombre',
        key,
        ...(multivalued ? { multivalued: true } : {}),
        ...(components.length ? { components } : {}),
      }
      const next = appendAttribute(get().diagram, ownerType, ownerId, attribute)
      if (!commit(next)) return ''
      return id
    },

    updateAttribute: (ownerType, ownerId, attributeId, patch) => {
      commit(patchAttribute(get().diagram, ownerType, ownerId, attributeId, patch))
    },

    deleteAttribute: (ownerType, ownerId, attributeId) => {
      commit(removeAttribute(get().diagram, ownerType, ownerId, attributeId))
    },

    createRelationship: (name, participants, position) => {
      const entityIds = new Set(get().diagram.entities.map((entity) => entity.id))
      if (
        participants.length < 2 ||
        participants.some((participant) => !entityIds.has(participant.entityId))
      ) {
        return ''
      }

      const id = makeId('relationship')
      const relationship: Relationship = {
        id,
        name: name.trim() || 'Sin nombre',
        participants: participants.map((participant) => ({
          entityId: participant.entityId,
          cardinality: { ...participant.cardinality },
        })),
        attributes: [],
      }
      commit(
        insertRelationship(
          get().diagram,
          relationship,
          position ?? defaultRelationshipPosition(get().diagram),
        ),
      )
      return id
    },

    /**
     * Shared relationship command used by the sheet, keyboard/toolbar entry
     * points, and direct handle gestures. A new target entity and its
     * relationship are committed together so the semantic model remains the
     * source of truth and one undo removes the complete gesture operation.
     */
    createRelationshipFlow: (sourceEntityId, target, name, options = {}) => {
      const current = get().diagram
      const source = current.entities.find((entity) => entity.id === sourceEntityId)
      if (!source) return null

      const sourcePosition = current.view.positions[sourceEntityId]
        ?? defaultEntityPosition(current.entities.findIndex((entity) => entity.id === sourceEntityId))
      let targetEntityId: string
      let targetPosition: Point
      let next = current

      if (typeof target === 'string') {
        const targetEntity = current.entities.find((entity) => entity.id === target)
        if (!targetEntity) return null
        targetEntityId = targetEntity.id
        targetPosition = current.view.positions[targetEntity.id]
          ?? defaultEntityPosition(current.entities.findIndex((entity) => entity.id === targetEntity.id))
      } else {
        targetEntityId = makeId('entity')
        targetPosition = target.position ?? defaultEntityPosition(current.entities.length)
        const entity: Entity = {
          id: targetEntityId,
          name: target.name?.trim() || 'Sin nombre',
          kind: target.kind ?? 'strong',
          attributes: [],
        }
        next = insertEntity(current, entity, targetPosition)
      }

      const relationshipId = makeId('relationship')
      const relationship: Relationship = {
        id: relationshipId,
        name: name.trim() || 'Sin nombre',
        participants: [sourceEntityId, targetEntityId].map((entityId, index) => ({
          entityId,
          cardinality: { ...(options.cardinalities?.[index] ?? unspecifiedCardinality()) },
        })),
        attributes: [],
      }
      const relationshipPosition = options.position
        ?? relationshipPositionBetween(sourcePosition, targetPosition, undefined, undefined, options.sourceSide)
      const committed = typeof target === 'string'
        ? insertRelationship(next, relationship, relationshipPosition, {
          cardinalitiesPending: options.cardinalitiesPending,
        })
        : insertEntityAndRelationship(current, next.entities.at(-1)!, relationship, targetPosition, relationshipPosition, {
          cardinalitiesPending: options.cardinalitiesPending,
        })
      if (!commit(committed)) return null
      return { entityId: targetEntityId, relationshipId }
    },

    renameRelationship: (id, name) => {
      commit(renameRelationshipCommand(get().diagram, id, name))
    },

    updateParticipant: (relationshipId, entityId, cardinality, participantIndex) => {
      commit(patchParticipant(get().diagram, relationshipId, entityId, { ...cardinality }, participantIndex))
    },

    deleteRelationship: (id) => {
      commit(removeRelationship(get().diagram, id))
    },

    setPosition: (id, point) => {
      // React Flow keeps pointer frames local; this is called once at drag
      // stop, so the completed move is a single undoable semantic operation.
      commit(moveItem(get().diagram, id, { x: point.x, y: point.y }))
    },

    setLayoutMode: (mode) => {
      if (mode === get().diagram.view.layoutMode) return
      commit(setLayoutModeCommand(get().diagram, mode))
    },

    reflowAttributes: () => {
      commit(reflowAttributesCommand(get().diagram))
    },

    setTheme: (theme) => {
      commitWithoutHistory(setDiagramTheme(get().diagram, theme))
    },

    updateCustomTheme: (patch) => {
      commitWithoutHistory(patchCustomTheme(get().diagram, patch))
    },

    resetDiagram: (mode = 'blank') => {
      commit(mode === 'sample' ? createSampleDiagram() : createBlankDiagram())
      set({ selection: null })
    },

    undo: () => {
      const state = get()
      const previous = state.past.at(-1)
      if (!previous) return
      set({
        diagram: previous,
        diagrams: putDiagramFirst(state.diagrams, previous),
        past: state.past.slice(0, -1),
        future: [state.diagram, ...state.future],
        canUndo: state.past.length > 1,
        canRedo: true,
        selection: selectionStillExists(state.selection, previous) ? state.selection : null,
      })
      persistDiagrams(putDiagramFirst(state.diagrams, previous))
    },

    redo: () => {
      const state = get()
      const next = state.future[0]
      if (!next) return
      set({
        diagram: next,
        diagrams: putDiagramFirst(state.diagrams, next),
        past: [...state.past, state.diagram],
        future: state.future.slice(1),
        canUndo: true,
        canRedo: state.future.length > 1,
        selection: selectionStillExists(state.selection, next) ? state.selection : null,
      })
      persistDiagrams(putDiagramFirst(state.diagrams, next))
    },
  }
})
