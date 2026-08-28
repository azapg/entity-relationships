import { beforeEach, describe, expect, it } from 'vitest'
import { createSampleDiagram } from './sample'
import { useDiagramStore } from './store'

const state = () => useDiagramStore.getState()

describe('modelo semántico del diagrama', () => {
  beforeEach(() => {
    state().resetDiagram('blank')
    // A reset is itself undoable; start each test with a clean history.
    useDiagramStore.setState({ past: [], future: [], canUndo: false, canRedo: false })
  })

  it('incluye una muestra editable con la notación académica', () => {
    const sample = createSampleDiagram()
    expect(sample.entities.map((entity) => entity.name)).toEqual(['STUDENT', 'COURSE'])
    expect(sample.relationships[0].name).toBe('ENROLLS')
    expect(sample.relationships[0].participants).toHaveLength(2)
    expect(sample.entities[0].attributes.find((attribute) => attribute.key)?.name).toBe('student_id')
    expect(sample.view.theme).toBe('academic')
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
})

