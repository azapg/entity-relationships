import { beforeEach, describe, expect, it } from 'vitest'
import { createSampleDiagram } from './sample'
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
      expect(migrated?.view.positions['sample-student']).toEqual({ x: 999, y: 888 })
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

  it('normaliza diagramas antiguos sin tocar posiciones ni contenido personalizado', () => {
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
      expect(loaded.view.positions['sample-student']).toEqual({ x: 11, y: 37 })
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
})
