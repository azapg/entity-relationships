import { create } from 'zustand'
import {
  appendAttribute,
  cloneDiagram,
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
import { ensureAttributeLayout, normalizeLayoutMode } from './layout'
import { createBlankDiagram, createSampleDiagram } from './sample'
import type {
  Attribute,
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

type PersistedDiagram = {
  version: typeof STORAGE_VERSION
  diagram: Diagram
}

type HistoryState = {
  past: Diagram[]
  future: Diagram[]
}

export type DiagramStore = {
  diagram: Diagram
  selection: SemanticSelection
  canUndo: boolean
  canRedo: boolean
  setSelection: (selection: SemanticSelection) => void
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
  renameRelationship: (id: string, name: string) => void
  updateParticipant: (
    relationshipId: string,
    entityId: string,
    cardinality: Cardinality,
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
  const candidate = {
    ...diagram,
    view: {
      ...diagram.view,
      layoutMode: normalizeLayoutMode(legacyView.layoutMode),
      attributeLayout,
    },
  }
  const attributeIds = new Set([
    ...diagram.entities.flatMap((entity) => entity.attributes.map((attribute) => attribute.id)),
    ...diagram.relationships.flatMap((relationship) =>
      relationship.attributes.map((attribute) => attribute.id)),
  ])
  return {
    ...candidate,
    view: {
      ...candidate.view,
      // Migration never moves a user's existing objects. Switching to
      // Structured explicitly performs the grid snap as one history action.
      positions: Object.fromEntries(
        Object.entries(diagram.view.positions).filter(([id]) => !attributeIds.has(id)),
      ),
      attributeLayout: ensureAttributeLayout(candidate),
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

export const persistDiagram = (diagram: Diagram) => {
  const storage = getStorage()
  if (!storage) return
  try {
    const payload: PersistedDiagram = {
      version: STORAGE_VERSION,
      diagram: cloneDiagram(normalizeDiagram(diagram)),
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(payload))
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

const selectionStillExists = (selection: SemanticSelection, diagram: Diagram) => {
  if (!selection) return true
  return selection.type === 'entity'
    ? diagram.entities.some((entity) => entity.id === selection.id)
    : diagram.relationships.some((relationship) => relationship.id === selection.id)
}

const initialDiagram = normalizeDiagram(readPersistedDiagram() ?? createSampleDiagram())

export const useDiagramStore = create<InternalStore>((set, get) => {
  const commit = (next: Diagram) => {
    const current = get().diagram
    if (next === current) return false
    const selection = get().selection
    set((state) => ({
      diagram: next,
      past: [...state.past, current],
      future: [],
      canUndo: true,
      canRedo: false,
      selection: selectionStillExists(selection, next) ? selection : null,
    }))
    persistDiagram(next)
    return true
  }

  const commitWithoutHistory = (next: Diagram) => {
    if (next === get().diagram) return false
    set({ diagram: next })
    persistDiagram(next)
    return true
  }

  return {
    diagram: initialDiagram,
    selection: null,
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,

    setSelection: (selection) => {
      if (selectionStillExists(selection, get().diagram)) set({ selection })
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

    addAttribute: (ownerType, ownerId, name, key = false) => {
      const id = makeId('attribute')
      const attribute: Attribute = { id, name: name.trim() || 'Sin nombre', key }
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
      const uniqueEntityIds = new Set(participants.map((participant) => participant.entityId))
      if (
        participants.length < 2 ||
        uniqueEntityIds.size !== participants.length ||
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

    renameRelationship: (id, name) => {
      commit(renameRelationshipCommand(get().diagram, id, name))
    },

    updateParticipant: (relationshipId, entityId, cardinality) => {
      commit(patchParticipant(get().diagram, relationshipId, entityId, { ...cardinality }))
    },

    deleteRelationship: (id) => {
      commit(removeRelationship(get().diagram, id))
    },

    setPosition: (id, point) => {
      commitWithoutHistory(moveItem(get().diagram, id, { x: point.x, y: point.y }))
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
        past: state.past.slice(0, -1),
        future: [state.diagram, ...state.future],
        canUndo: state.past.length > 1,
        canRedo: true,
        selection: selectionStillExists(state.selection, previous) ? state.selection : null,
      })
      persistDiagram(previous)
    },

    redo: () => {
      const state = get()
      const next = state.future[0]
      if (!next) return
      set({
        diagram: next,
        past: [...state.past, state.diagram],
        future: state.future.slice(1),
        canUndo: true,
        canRedo: state.future.length > 1,
        selection: selectionStillExists(state.selection, next) ? state.selection : null,
      })
      persistDiagram(next)
    },
  }
})
