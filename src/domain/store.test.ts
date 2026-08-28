import { beforeEach, describe, expect, it } from 'vitest'
import { createSampleDiagram } from './sample'
import { GRID_SIZE } from './layout'
import { persistDiagram, readPersistedDiagram, STORAGE_KEY, STORAGE_VERSION, useDiagramStore } from './store'

const state = () => useDiagramStore.getState()

const memoryStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => void values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    },
  } satisfies Storage
}

describe('modelo semántico del diagrama', () => {
  beforeEach(() => {
    state().resetDiagram('blank')
    // A reset is itself undoable; start each test with a clean history.
    useDiagramStore.setState({ past: [], future: [], canUndo: false, canRedo: false })
  })

  it('incluye una muestra editable con la notación académica', () => {
    const sample = createSampleDiagram()
    expect(sample.entities.map((entity) => entity.name)).toEqual(['ESTUDIANTE', 'CURSO'])
    expect(sample.relationships[0].name).toBe('INSCRIBE')
    expect(sample.relationships[0].participants).toHaveLength(2)
    expect(sample.entities[0].attributes.find((attribute) => attribute.key)?.name).toBe('estudiante_id')
    expect(sample.view.theme).toBe('academic')
    expect(Object.values(sample.view.positions).every(({ x, y }) =>
      x % GRID_SIZE === 0 && y % GRID_SIZE === 0)).toBe(true)
  })

  it('migra las etiquetas inglesas de la muestra persistida y conserva su configuración', () => {
    const storage = memoryStorage()
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })

    try {
      const legacy = createSampleDiagram()
      legacy.entities[0].name = 'STUDENT'
      legacy.entities[0].attributes[0].name = 'student_id'
      legacy.entities[0].attributes[1].name = 'name'
      legacy.entities[1].name = 'COURSE'
      legacy.entities[1].attributes[0].name = 'course_id'
      legacy.entities[1].attributes[1].name = 'title'
      legacy.relationships[0].name = 'ENROLLS'
      legacy.relationships[0].attributes[0].name = 'grade'
      legacy.view.positions['sample-student'] = { x: 999, y: 888 }
      legacy.view.theme = 'modern'
      persistDiagram(legacy)

      const migrated = readPersistedDiagram()
      expect(migrated?.entities.map((entity) => entity.name)).toEqual(['ESTUDIANTE', 'CURSO'])
      expect(migrated?.entities[0].attributes.map((attribute) => attribute.name)).toEqual(['estudiante_id', 'nombre'])
      expect(migrated?.entities[1].attributes.map((attribute) => attribute.name)).toEqual(['curso_id', 'título'])
      expect(migrated?.relationships[0].name).toBe('INSCRIBE')
      expect(migrated?.relationships[0].attributes[0].name).toBe('calificación')
      expect(migrated?.view.positions['sample-student']).toEqual({ x: 1008, y: 888 })
      expect(migrated?.view.theme).toBe('modern')

      const persisted = JSON.parse(storage.getItem(STORAGE_KEY)!)
      expect(persisted.version).toBe(STORAGE_VERSION)
      expect(persisted.diagram.entities[0].name).toBe('ESTUDIANTE')
    } finally {
      if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })

  it('conserva las etiquetas personalizadas de una muestra persistida', () => {
    const storage = memoryStorage()
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })

    try {
      const customized = createSampleDiagram()
      customized.entities[0].name = 'Alumnado'
      customized.entities[0].attributes[0].name = 'matrícula'
      customized.relationships[0].name = 'Cursa'
      persistDiagram(customized)

      const loaded = readPersistedDiagram()
      expect(loaded?.entities[0].name).toBe('Alumnado')
      expect(loaded?.entities[0].attributes[0].name).toBe('matrícula')
      expect(loaded?.relationships[0].name).toBe('Cursa')
    } finally {
      if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })

  it('al borrar una entidad elimina sus relaciones y posiciones asociadas', () => {
    const professorId = state().createEntity('PROFESSOR')
    const courseId = state().createEntity('COURSE')
    const relationshipId = state().createRelationship('TEACHES', [
      { entityId: professorId, cardinality: { min: 1, max: 'n' } },
      { entityId: courseId, cardinality: { min: 0, max: 'n' } },
    ])

    state().deleteEntity(courseId)

    expect(state().diagram.entities.map((entity) => entity.id)).toEqual([professorId])
    expect(state().diagram.relationships).toHaveLength(0)
    expect(state().diagram.view.positions[courseId]).toBeUndefined()
    expect(state().diagram.view.positions[relationshipId]).toBeUndefined()
  })

  it('deshace y rehace operaciones semánticas, sin convertir nodos en canonical', () => {
    const entityId = state().createEntity('STUDENT')
    const attributeId = state().addAttribute('entity', entityId, 'student_id', true)
    expect(state().diagram.entities[0].attributes[0].id).toBe(attributeId)

    state().undo()
    expect(state().diagram.entities[0].attributes).toHaveLength(0)
    expect(state().canRedo).toBe(true)

    state().redo()
    expect(state().diagram.entities[0].attributes[0].name).toBe('student_id')

    state().renameEntity(entityId, 'ALUMNO')
    expect(state().diagram.entities[0].name).toBe('ALUMNO')
    state().undo()
    expect(state().diagram.entities[0].name).toBe('STUDENT')
  })

  it('normaliza diagramas antiguos y conserva el contenido personalizado', () => {
    const storage = memoryStorage()
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })

    try {
      const legacy = createSampleDiagram() as unknown as Record<string, unknown>
      const view = { ...(legacy.view as Record<string, unknown>) }
      delete view.layoutMode
      delete view.attributeLayout
      view.positions = {
        'sample-student': { x: 11, y: 37 },
        'sample-course': { x: 88, y: 119 },
      }
      legacy.view = view
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, diagram: legacy }))

      const loaded = readPersistedDiagram()!
      expect(loaded.view.layoutMode).toBe('structured')
      expect(loaded.view.positions['sample-student']).toEqual({ x: 0, y: 48 })
      expect(loaded.view.attributeLayout['sample-student-id'].side).toMatch(/north|east|south|west/)
      const persisted = JSON.parse(storage.getItem(STORAGE_KEY)!)
      expect(persisted.diagram.view.layoutMode).toBe('structured')
      expect(persisted.diagram.view.attributeLayout['sample-course-title']).toBeTruthy()
    } finally {
      if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })

  it('assigns stable sides on add/edit and prunes them on delete', () => {
    const entityId = state().createEntity('ACCOUNT')
    const first = state().addAttribute('entity', entityId, 'id', true)
    const second = state().addAttribute('entity', entityId, 'email')
    const before = state().diagram.view.attributeLayout
    expect(before[first]).toBeTruthy()
    expect(before[second]).toBeTruthy()

    state().updateAttribute('entity', entityId, first, { name: 'account_id', key: false })
    expect(state().diagram.view.attributeLayout[first]).toEqual(before[first])
    state().deleteAttribute('entity', entityId, first)
    expect(state().diagram.view.attributeLayout[first]).toBeUndefined()
    expect(state().diagram.view.attributeLayout[second]).toEqual(before[second])
  })

  it('switches modes atomically, snaps only when entering structured, and undoes the switch', () => {
    const entityId = state().createEntity('ACCOUNT', 'strong', { x: 101, y: 131 })
    expect(state().diagram.view.positions[entityId]).toEqual({ x: 96, y: 120 })
    state().setLayoutMode('freeform')
    state().setPosition(entityId, { x: 101, y: 131 })
    expect(state().diagram.view.positions[entityId]).toEqual({ x: 101, y: 131 })
    state().setLayoutMode('structured')
    expect(state().diagram.view.positions[entityId]).toEqual({ x: 96, y: 120 })
    state().undo()
    expect(state().diagram.view.layoutMode).toBe('freeform')
    expect(state().diagram.view.positions[entityId]).toEqual({ x: 101, y: 131 })
  })

  it('reflows all owners deterministically while preserving semantic content', () => {
    const entityId = state().createEntity('ACCOUNT')
    const one = state().addAttribute('entity', entityId, 'one')
    const two = state().addAttribute('entity', entityId, 'two')
    const original = state().diagram.entities.find((entity) => entity.id === entityId)!
    state().reflowAttributes()
    const layout = state().diagram.view.attributeLayout
    expect(layout[one]).toEqual({ side: 'north' })
    expect(layout[two]).toEqual({ side: 'east' })
    expect(state().diagram.entities.find((entity) => entity.id === entityId)).toEqual(original)
  })

  it('preserves fractional coordinates when a freeform diagram is normalized and persisted', () => {
    const storage = memoryStorage()
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })

    try {
      const freeform = createSampleDiagram()
      freeform.view.layoutMode = 'freeform'
      freeform.view.positions['sample-student'] = { x: 11.25, y: 37.5 }
      persistDiagram(freeform)
      const loaded = readPersistedDiagram()!
      expect(loaded.view.layoutMode).toBe('freeform')
      expect(loaded.view.positions['sample-student']).toEqual({ x: 11.25, y: 37.5 })
    } finally {
      if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })

  it('keeps canonical structured coordinates unchanged when entering freeform', () => {
    const entityId = state().createEntity('ACCOUNT', 'strong', { x: 101, y: 131 })
    const canonical = { ...state().diagram.view.positions[entityId] }
    state().setLayoutMode('freeform')
    expect(state().diagram.view.positions[entityId]).toEqual(canonical)
  })

  it('creates an existing-target relationship through one shared flow command', () => {
    const sourceId = state().createEntity('SOURCE', 'strong', { x: 101, y: 131 })
    const targetId = state().createEntity('TARGET', 'strong', { x: 509, y: 131 })
    const result = state().createRelationshipFlow(sourceId, targetId, 'USES', {
      cardinalitiesPending: true,
      sourceSide: 'east',
    })

    expect(result?.entityId).toBe(targetId)
    expect(state().diagram.relationships).toHaveLength(1)
    const relationship = state().diagram.relationships[0]
    expect(relationship.participants.map(({ entityId }) => entityId)).toEqual([sourceId, targetId])
    expect(state().diagram.view.positions[relationship.id].x % GRID_SIZE).toBe(0)
    expect(state().diagram.view.positions[relationship.id].y % GRID_SIZE).toBe(0)
    expect(state().diagram.view.pendingCardinalities?.[relationship.id]).toBe(true)

    state().updateParticipant(relationship.id, sourceId, { min: 1, max: 1 })
    expect(state().diagram.view.pendingCardinalities?.[relationship.id]).toBeUndefined()
  })

  it('creates a recursive relationship with two independently editable roles', () => {
    const professorId = state().createEntity('PROFESOR', 'strong', { x: 0, y: 0 })
    const result = state().createRelationshipFlow(professorId, professorId, 'IMPARTE', {
      sourceSide: 'east',
      cardinalities: [
        { min: 1, max: 1 },
        { min: 0, max: 'n' },
      ],
    })

    expect(result?.entityId).toBe(professorId)
    expect(state().diagram.relationships).toHaveLength(1)
    const relationship = state().diagram.relationships[0]
    expect(relationship.participants.map(({ entityId }) => entityId)).toEqual([professorId, professorId])
    expect(relationship.participants.map(({ cardinality }) => cardinality)).toEqual([
      { min: 1, max: 1 },
      { min: 0, max: 'n' },
    ])
    expect(state().diagram.view.positions[relationship.id]).toEqual({ x: 240, y: 0 })

    state().updateParticipant(relationship.id, professorId, { min: 0, max: 1 }, 0)
    expect(state().diagram.relationships[0].participants.map(({ cardinality }) => cardinality)).toEqual([
      { min: 0, max: 1 },
      { min: 0, max: 'n' },
    ])
  })

  it('creates a new target entity and relationship as one undoable operation', () => {
    const sourceId = state().createEntity('SOURCE', 'strong', { x: 0, y: 0 })
    const result = state().createRelationshipFlow(sourceId, {
      name: 'TARGET',
      position: { x: 317, y: 149 },
    }, 'CONNECTS', { cardinalitiesPending: true })

    expect(result).not.toBeNull()
    expect(state().diagram.entities).toHaveLength(2)
    expect(state().diagram.relationships).toHaveLength(1)
    expect(state().diagram.view.positions[result!.entityId]).toEqual({ x: 312, y: 144 })
    expect(state().diagram.view.pendingCardinalities?.[result!.relationshipId]).toBe(true)

    state().undo()
    expect(state().diagram.entities).toHaveLength(1)
    expect(state().diagram.relationships).toHaveLength(0)
  })

  it('keeps a completed major-node move undoable as one operation', () => {
    const entityId = state().createEntity('MOVABLE', 'strong', { x: 0, y: 0 })
    state().setPosition(entityId, { x: 101, y: 131 })
    expect(state().diagram.view.positions[entityId]).toEqual({ x: 96, y: 120 })
    state().undo()
    expect(state().diagram.view.positions[entityId]).toEqual({ x: 0, y: 0 })
  })
})
