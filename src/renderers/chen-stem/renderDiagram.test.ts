import { describe, expect, it } from 'vitest'
import type { Diagram } from '../../domain/types'
import { createSampleDiagram } from '../../domain/sample'
import { Position } from '@xyflow/react'
import { orthogonalRoute } from './ConnectorEdge'
import { renderDiagram } from './renderDiagram'

const baseDiagram = (overrides: Partial<Diagram> = {}): Diagram => ({
  id: 'test-diagram',
  name: 'Prueba',
  entities: [],
  relationships: [],
  view: { renderer: 'chen-stem', theme: 'academic', positions: {}, layoutMode: 'structured', attributeLayout: {} },
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
      semanticId: 'sample-student', kind: 'entity', label: 'ESTUDIANTE', selected: false,
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
      view: { renderer: 'chen-stem', theme: 'academic', positions: {}, layoutMode: 'structured', attributeLayout: {} },
    })
    const result = renderDiagram(diagram)
    const attribute = result.nodes.find((node) => node.id === 'attribute:relationship:enrolls:grade')
    expect(attribute).toMatchObject({ type: 'attribute', draggable: false, selectable: false })
    expect(attribute?.data).toMatchObject({ semanticId: 'grade', ownerId: 'enrolls', ownerKind: 'relationship' })
    expect(result.edges.find((edge) => edge.id === 'attribute-edge:relationship:enrolls:grade'))
      .toMatchObject({ source: 'relationship:enrolls', target: 'attribute:relationship:enrolls:grade' })
  })

  it('connects each attribute stem to the terminal marker on its lane', () => {
    const result = renderDiagram(baseDiagram({
      entities: [{
        ...entity('person'),
        attributes: [
          { id: 'north', name: 'north', key: true },
          { id: 'south', name: 'south', key: false },
          { id: 'east', name: 'east', key: false },
          { id: 'west', name: 'west', key: true },
        ],
      }],
    }))

    expect(result.edges.filter((edge) => edge.id.startsWith('attribute-edge:')).map((edge) => ({
      lane: edge.data?.lane,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    }))).toEqual([
      { lane: 'north', sourceHandle: 'source-north-north', targetHandle: 'target-terminal' },
      { lane: 'south', sourceHandle: 'source-south-south', targetHandle: 'target-terminal' },
      { lane: 'east', sourceHandle: 'source-east-east', targetHandle: 'target-terminal' },
      { lane: 'west', sourceHandle: 'source-west-west', targetHandle: 'target-terminal' },
    ])
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
      view: { renderer: 'chen-stem', theme: 'academic', positions: {}, layoutMode: 'structured', attributeLayout: {} },
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

  it('keeps a dense fixture derived, aligned, and non-draggable', () => {
    const names = ['MOVIE', 'EPISODE', 'SERIES', 'CATEGORY', 'STATUS']
    const entities = names.map((name, entityIndex) => ({
      id: name.toLowerCase(), name, kind: 'strong' as const,
      attributes: Array.from({ length: 4 + (entityIndex % 5) }, (_, index) => ({
        id: `${name.toLowerCase()}-${index}`, name: `field_${index}`, key: index === 0,
      })),
    }))
    const relationships = [
      { id: 'has', name: 'HAS', participants: [{ entityId: 'movie', cardinality: { min: 1 as const, max: 1 as const } }, { entityId: 'episode', cardinality: { min: 1 as const, max: 'n' as const } }], attributes: [] },
      { id: 'in', name: 'IN', participants: [{ entityId: 'episode', cardinality: { min: 1 as const, max: 1 as const } }, { entityId: 'series', cardinality: { min: 1 as const, max: 'n' as const } }], attributes: [{ id: 'in-year', name: 'year', key: false }] },
      { id: 'status', name: 'STATUS', participants: [{ entityId: 'movie', cardinality: { min: 0 as const, max: 'n' as const } }, { entityId: 'status', cardinality: { min: 1 as const, max: 1 as const } }], attributes: [] },
    ]
    const positions = Object.fromEntries(names.map((name, index) => [name.toLowerCase(), { x: 100 + index * 215, y: 100 + (index % 2) * 180 }]))
    const result = renderDiagram({ ...baseDiagram({ entities, relationships }), view: { ...baseDiagram().view, positions } })
    const attributes = result.nodes.filter((node) => node.data.kind === 'attribute')
    expect(attributes).toHaveLength(31)
    expect(attributes.every((node) => node.draggable === false && node.selectable === false)).toBe(true)
    const owners = result.nodes.filter((node) => node.data.kind !== 'attribute')
    owners.forEach((owner) => {
      const handles = (owner.data.attributeHandles ?? []) as Array<{ id: string }>
      expect(new Set(handles.map((handle) => handle.id)).size).toBe(handles.length)
    })
    const attrPositions = new Map(attributes.map((node) => [node.id, node.position]))
    const moved = renderDiagram({ ...baseDiagram({ entities, relationships }), view: { ...baseDiagram().view, positions: { ...positions, movie: { x: 240, y: 240 } } } })
    const oldMovie = result.nodes.find((node) => node.id === 'entity:movie')!
    const newMovie = moved.nodes.find((node) => node.id === 'entity:movie')!
    const dx = newMovie.position.x - oldMovie.position.x
    const dy = newMovie.position.y - oldMovie.position.y
    attributes.filter((node) => node.data.ownerId === 'movie').forEach((node) => {
      const next = moved.nodes.find((candidate) => candidate.id === node.id)!
      expect(next.position).toEqual({ x: node.position.x + dx, y: node.position.y + dy })
      expect(attrPositions.has(node.id)).toBe(true)
    })
    expect(result.edges.filter((edge) => edge.id.startsWith('participant-edge:'))).toHaveLength(6)
  })

  it('closes side gaps when an attribute is deleted from the projection', () => {
    const make = (ids: string[]) => baseDiagram({
      entities: [{ ...entity('person'), attributes: ids.map((id) => ({ id, name: id, key: false })) }],
      view: {
        ...baseDiagram().view,
        positions: {},
        attributeLayout: Object.fromEntries(ids.map((id) => [id, { side: 'north' as const }])),
      },
    })
    const before = renderDiagram(make(['one', 'two', 'three']))
    const after = renderDiagram(make(['one', 'three']))
    const beforeThree = before.nodes.find((node) => node.id.endsWith(':three'))!
    const afterThree = after.nodes.find((node) => node.id.endsWith(':three'))!
    expect(afterThree.data.side).toBe(beforeThree.data.side)
    expect(afterThree.position).not.toEqual(beforeThree.position)
    expect(afterThree.position.x).toBeLessThan(beforeThree.position.x)
    expect(afterThree.position.y).toBeGreaterThan(beforeThree.position.y)
  })

  it('routes every connector with horizontal and vertical segments only', () => {
    const routes = [
      orthogonalRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, Position.Right, Position.Left),
      orthogonalRoute({ x: 0, y: 0 }, { x: 100, y: 80 }, Position.Right, Position.Left),
      orthogonalRoute({ x: 0, y: 0 }, { x: 100, y: 80 }, Position.Bottom, Position.Left),
    ]
    routes.forEach((points) => points.slice(1).forEach((point, index) => {
      const previous = points[index]
      expect(point.x === previous.x || point.y === previous.y).toBe(true)
    }))
  })
})
