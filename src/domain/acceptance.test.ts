import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readPersistedDiagram, useDiagramStore } from './store'
import type { Diagram } from './types'

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

describe('flujo de aceptación semántico', () => {
  let previousStorage: PropertyDescriptor | undefined

  beforeEach(() => {
    state().resetDiagram('sample')
    useDiagramStore.setState({ past: [], future: [], canUndo: false, canRedo: false })

    previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: memoryStorage(),
    })
  })

  afterEach(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('recorre creación, edición, persistencia, undo y borrado sin huérfanos', () => {
    const professorId = state().createEntity('PROFESSOR')
    const professorKeyId = state().addAttribute('entity', professorId, 'professor_id', true)
    const professorNameId = state().addAttribute('entity', professorId, 'name')
    expect(professorKeyId).toBeTruthy()
    expect(professorNameId).toBeTruthy()

    state().setEntityKind(professorId, 'weak')
    expect(state().diagram.entities.find((entity) => entity.id === professorId)?.kind).toBe('weak')
    state().setEntityKind(professorId, 'strong')
    expect(state().diagram.entities.find((entity) => entity.id === professorId)?.kind).toBe('strong')

    const course = state().diagram.entities.find((entity) => entity.name === 'COURSE')
    expect(course).toBeDefined()
    const courseId = course!.id
    const teachesId = state().createRelationship('TEACHES', [
      { entityId: professorId, cardinality: { min: 1, max: 'n' } },
      { entityId: courseId, cardinality: { min: 0, max: 'n' } },
    ])
    expect(teachesId).toBeTruthy()

    const semesterId = state().addAttribute('relationship', teachesId, 'semester')
    expect(semesterId).toBeTruthy()
    state().updateParticipant(teachesId, professorId, { min: 0, max: 1 })
    state().updateParticipant(teachesId, professorId, { min: 1, max: 'n' })
    state().renameEntity(professorId, 'INSTRUCTOR')
    state().setPosition(professorId, { x: 512, y: 288 })
    state().setTheme('warm')

    const instructor = state().diagram.entities.find((entity) => entity.id === professorId)
    expect(instructor?.name).toBe('INSTRUCTOR')
    expect(state().diagram.view.positions[professorId]).toEqual({ x: 512, y: 288 })
    expect(state().diagram.view.theme).toBe('warm')
    expect(state().diagram.relationships.find((relationship) => relationship.id === teachesId)?.attributes).toEqual([
      { id: semesterId, name: 'semester', key: false },
    ])

    // This exercises the versioned persistence boundary. It is equivalent to
    // the data the store reads on a fresh page load without re-importing the singleton.
    const persisted = readPersistedDiagram()
    expect(persisted?.view.theme).toBe('warm')
    expect(persisted?.entities.find((entity) => entity.id === professorId)?.name).toBe('INSTRUCTOR')

    state().deleteRelationship(teachesId)
    expect(state().diagram.relationships.some((relationship) => relationship.id === teachesId)).toBe(false)
    state().undo()
    expect(state().diagram.relationships.some((relationship) => relationship.id === teachesId)).toBe(true)

    state().deleteEntity(courseId)
    expect(state().diagram.entities.some((entity) => entity.id === courseId)).toBe(false)
    // Both the original sample ENROLLS and the new TEACHES reference COURSE.
    expect(state().diagram.relationships).toHaveLength(0)
    expect(Object.hasOwn(state().diagram.view.positions, courseId)).toBe(false)
    expect(Object.values(state().diagram.view.positions)).not.toContain(undefined)

    const entityIds = new Set(state().diagram.entities.map((entity) => entity.id))
    expect(
      state().diagram.relationships.every((relationship) =>
        relationship.participants.every((participant) => entityIds.has(participant.entityId)),
      ),
    ).toBe(true)

    // Keep the compiler honest about this being a semantic Diagram round-trip.
    const hydrated: Diagram | undefined = persisted
    expect(hydrated?.relationships.some((relationship) => relationship.id === teachesId)).toBe(true)
  })
})

