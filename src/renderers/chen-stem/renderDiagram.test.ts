import { describe, expect, it } from 'vitest'
import type { Diagram } from '../../domain/types'
import { createSampleDiagram } from '../../domain/sample'
import { renderDiagram } from './renderDiagram'

const baseDiagram = (overrides: Partial<Diagram> = {}): Diagram => ({
  id: 'test-diagram',
  name: 'Prueba',
  entities: [],
  relationships: [],
  view: { renderer: 'chen-stem', theme: 'academic', positions: {} },
  ...overrides,
})

const entity = (id: string, kind: 'strong' | 'weak' = 'strong') => ({
  id,
  name: id.toUpperCase(),
  kind,
  attributes: [],
})

describe('renderDiagram / Chen-stem', () => {
  it('projects the sample with deterministic semantic node and edge IDs', () => {
    const diagram = createSampleDiagram()
    const first = renderDiagram(diagram)
    const second = renderDiagram(diagram)

    expect(first.nodes).toHaveLength(8) // 2 entities + relationship + 5 attributes
    expect(first.edges).toHaveLength(7) // 2 participants + 5 attribute stems
    expect(first.nodes.map(({ id }) => id)).toEqual(second.nodes.map(({ id }) => id))
    expect(first.edges.map(({ id }) => id)).toEqual(second.edges.map(({ id }) => id))
    expect(first.nodes.find((node) => node.id === 'entity:sample-student')?.data).toMatchObject({
      semanticId: 'sample-student', kind: 'entity', label: 'STUDENT', selected: false,
    })
    expect(first.edges.find((edge) => edge.id === 'participant-edge:sample-enrolls:sample-student:0')?.data)
      .toMatchObject({ cardinality: { min: 0, max: 'n' } })
  })

  it('preserves weak entity kind in the projected node', () => {
    const result = renderDiagram(baseDiagram({ entities: [entity('invoice', 'weak')] }))
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]).toMatchObject({ id: 'entity:invoice', type: 'entity' })
    expect(result.nodes[0].data).toMatchObject({ entityKind: 'weak', kindType: 'weak' })
  })

  it('projects relationship attributes as attributes owned by the relationship', () => {
    const diagram = baseDiagram({
      entities: [entity('student'), entity('course')],
      relationships: [{
        id: 'enrolls', name: 'ENROLLS',
        participants: [
          { entityId: 'student', cardinality: { min: 0, max: 'n' } },
          { entityId: 'course', cardinality: { min: 1, max: 1 } },
        ],
        attributes: [{ id: 'grade', name: 'grade', key: false }],
      }],
      view: { renderer: 'chen-stem', theme: 'academic', positions: {} },
    })
    const result = renderDiagram(diagram)
    const attribute = result.nodes.find((node) => node.id === 'attribute:relationship:enrolls:grade')
    expect(attribute).toMatchObject({ type: 'attribute', draggable: false, selectable: false })
    expect(attribute?.data).toMatchObject({ semanticId: 'grade', ownerId: 'enrolls', ownerKind: 'relationship' })
    expect(result.edges.find((edge) => edge.id === 'attribute-edge:relationship:enrolls:grade'))
      .toMatchObject({ source: 'relationship:enrolls', target: 'attribute:relationship:enrolls:grade' })
  })

  it('supports n-ary participant lists and ignores missing entity references', () => {
    const diagram = baseDiagram({
      entities: [entity('student'), entity('course'), entity('teacher')],
      relationships: [{
        id: 'teaches', name: 'TEACHES',
        participants: [
          { entityId: 'student', cardinality: { min: 0, max: 1 } },
          { entityId: 'course', cardinality: { min: 1, max: 'n' } },
          { entityId: 'teacher', cardinality: { min: 1, max: 1 } },
          { entityId: 'removed', cardinality: { min: 0, max: 'n' } },
        ],
        attributes: [],
      }],
      view: { renderer: 'chen-stem', theme: 'academic', positions: {} },
    })
    const result = renderDiagram(diagram)
    const participantEdges = result.edges.filter((edge) => edge.id.startsWith('participant-edge:'))
    expect(participantEdges).toHaveLength(3)
    expect(participantEdges.some((edge) => edge.source === 'entity:removed')).toBe(false)
    expect(participantEdges.map((edge) => edge.data)).toEqual([
      { connectorKind: 'participant', cardinality: { min: 0, max: 1 }, selected: false },
      { connectorKind: 'participant', cardinality: { min: 1, max: 'n' }, selected: false },
      { connectorKind: 'participant', cardinality: { min: 1, max: 1 }, selected: false },
    ])
  })
})

