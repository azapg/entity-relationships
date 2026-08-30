import { Position } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { GRID_SIZE } from '../../domain/layout'
import type { AttributeSide, Diagram } from '../../domain/types'
import { createSampleDiagram } from '../../domain/sample'
import { cardinalityLabelPosition, offsetConnectionPoint, orthogonalRoute } from './ConnectorEdge'
import { connectionHandleBox, STATIC_HANDLE_SIDES, positionForSide, staticHandleId } from './handles'
import {
  ATTRIBUTE_SIZE,
  DIAMOND_INSET,
  ENTITY_SIZE,
  MAX_ENTITY_WIDTH,
  RELATION_SIZE,
  allocateAttributeSides,
  attributeGeometry,
  distributedSlots,
  entityWidth,
  ownerBoundaryPoint,
  renderDiagram,
  type OwnerGeometry,
} from './renderDiagram'

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

const attributeNames: Record<string, string[]> = {
  movie: ['id', 'title', 'year', 'duration', 'audio', 'video'],
  episode: ['id', 'title', 'number', 'season', 'year', 'duration', 'audio', 'video'],
  series: ['id', 'name', 'year', 'seasons', 'audio', 'video'],
  category: ['id', 'name', 'description', 'year', 'active'],
  status: ['id', 'name', 'label', 'rank'],
}

const denseFixture = (): Diagram => {
  const entities = Object.entries(attributeNames).map(([id, names]) => ({
    id,
    name: id.toUpperCase(),
    kind: 'strong' as const,
    attributes: names.map((name, index) => ({ id: `${id}-${name}`, name, key: index === 0 })),
  }))
  const relationships: Diagram['relationships'] = [
    {
      id: 'rel-movie-category', name: 'IN',
      participants: [
        { entityId: 'movie', cardinality: { min: 1, max: 1 } },
        { entityId: 'category', cardinality: { min: 1, max: 'n' } },
      ],
      attributes: [{ id: 'rel-movie-category-note', name: 'note', key: false }],
    },
    {
      id: 'rel-series-category', name: 'IN',
      participants: [
        { entityId: 'series', cardinality: { min: 1, max: 1 } },
        { entityId: 'category', cardinality: { min: 1, max: 'n' } },
      ],
      attributes: [{ id: 'rel-series-category-order', name: 'order', key: false }],
    },
    {
      id: 'rel-episode-series', name: 'HAS',
      participants: [
        { entityId: 'episode', cardinality: { min: 1, max: 'n' } },
        { entityId: 'series', cardinality: { min: 1, max: 1 } },
      ],
      attributes: [{ id: 'rel-episode-series-year', name: 'year', key: false }],
    },
    {
      id: 'rel-movie-status', name: 'IN',
      participants: [
        { entityId: 'movie', cardinality: { min: 0, max: 'n' } },
        { entityId: 'status', cardinality: { min: 1, max: 1 } },
      ],
      attributes: [{ id: 'rel-movie-status-since', name: 'since', key: false }],
    },
    {
      id: 'rel-series-status', name: 'IN',
      participants: [
        { entityId: 'series', cardinality: { min: 0, max: 'n' } },
        { entityId: 'status', cardinality: { min: 1, max: 1 } },
      ],
      attributes: [{ id: 'rel-series-status-since', name: 'since', key: false }],
    },
  ]
  const positions = {
    category: { x: 480, y: 48 },
    movie: { x: 72, y: 336 },
    episode: { x: 456, y: 336 },
    series: { x: 840, y: 336 },
    status: { x: 480, y: 624 },
    'rel-movie-category': { x: 192, y: 120 },
    'rel-series-category': { x: 864, y: 120 },
    'rel-episode-series': { x: 720, y: 336 },
    'rel-movie-status': { x: 192, y: 624 },
    'rel-series-status': { x: 864, y: 624 },
  }
  const sideOrder: AttributeSide[] = ['north', 'south', 'east', 'west']
  const attributeLayout = Object.fromEntries([
    ...entities.flatMap((item) => item.attributes.map((attribute, index) => [attribute.id, { side: sideOrder[index % 4] }] as const)),
    ...relationships.flatMap((item, index) => item.attributes.map((attribute) => [attribute.id, { side: sideOrder[index % 4] }] as const)),
  ])
  return baseDiagram({
    entities,
    relationships,
    view: { ...baseDiagram().view, positions, attributeLayout },
  })
}

const localTerminal = (geometry: ReturnType<typeof attributeGeometry>) => ({
  x: geometry.terminal.x - geometry.position.x,
  y: geometry.terminal.y - geometry.position.y,
})

describe('renderDiagram / Chen-stem', () => {
  it('keeps relationship tips on the grid rhythm', () => {
    expect(RELATION_SIZE.width % GRID_SIZE).toBe(0)
    expect(RELATION_SIZE.height % GRID_SIZE).toBe(0)
    expect((RELATION_SIZE.width / 2) % GRID_SIZE).toBe(0)
    expect((RELATION_SIZE.height / 2) % GRID_SIZE).toBe(0)
    expect(DIAMOND_INSET).toBe(0)
  })

  it('projects the sample with deterministic semantic node and edge IDs', () => {
    const diagram = createSampleDiagram()
    const first = renderDiagram(diagram)
    const second = renderDiagram(diagram)

    expect(first.nodes).toHaveLength(8)
    expect(first.edges).toHaveLength(7)
    expect(first.nodes.map(({ id }) => id)).toEqual(second.nodes.map(({ id }) => id))
    expect(first.edges.map(({ id }) => id)).toEqual(second.edges.map(({ id }) => id))
    expect(first.nodes.find((node) => node.id === 'entity:sample-student')?.data).toMatchObject({
      semanticId: 'sample-student', kind: 'entity', label: 'ESTUDIANTE', selected: false,
    })
    expect(first.edges.find((edge) => edge.id === 'participant-edge:sample-enrolls:sample-student:0')?.data)
      .toMatchObject({ cardinality: { min: 0, max: 'n' } })
  })

  it('uses stable typography-aware entity widths rounded to the grid', () => {
    expect(entityWidth('USER')).toBe(ENTITY_SIZE.width)
    const long = entityWidth('INTERNATIONAL_ENTERPRISE_ACCOUNT_RECORD')
    expect(long).toBeGreaterThan(ENTITY_SIZE.width)
    expect(long % 24).toBe(0)
    expect(entityWidth('M'.repeat(200))).toBe(MAX_ENTITY_WIDTH)

    const result = renderDiagram(baseDiagram({
      entities: [{ ...entity('long'), name: 'INTERNATIONAL_ENTERPRISE_ACCOUNT_RECORD' }],
    }))
    expect(result.nodes[0].width).toBe(long)
    expect(result.nodes[0].data.width).toBe(long)
  })

  it('distributes side slots across the usable rhythm without collapsing dense coordinates', () => {
    expect(distributedSlots(192, 1)).toEqual([96])
    expect(distributedSlots(192, 3)).toEqual([24, 96, 168])
    expect(distributedSlots(96, 3)).toEqual([24, 48, 72])
    const dense = distributedSlots(96, 8)
    expect(new Set(dense).size).toBe(8)
    expect(dense[0]).toBe(6)
    expect(dense.at(-1)).toBe(90)
    expect(dense.every((slot, index) => index === 0 || slot > dense[index - 1])).toBe(true)
  })

  it('puts terminal centers on the exact target-handle coordinates for every side', () => {
    const owner: OwnerGeometry = {
      kind: 'entity', id: 'person', position: { x: 240, y: 240 },
      ...ENTITY_SIZE, attributes: [],
    }
    expect(localTerminal(attributeGeometry(owner, 'east', 0, 1))).toEqual({ x: 6, y: 12 })
    expect(localTerminal(attributeGeometry(owner, 'west', 0, 1))).toEqual({ x: ATTRIBUTE_SIZE.width - 6, y: 12 })
    expect(localTerminal(attributeGeometry(owner, 'north', 0, 1))).toEqual({ x: ATTRIBUTE_SIZE.width / 2, y: 18 })
    expect(localTerminal(attributeGeometry(owner, 'south', 0, 1))).toEqual({ x: ATTRIBUTE_SIZE.width / 2, y: 6 })
  })

  it('places relationship attribute attachments exactly on the visible diamond', () => {
    const owner: OwnerGeometry = {
      kind: 'relationship', id: 'enrolls', position: { x: 240, y: 240 },
      ...RELATION_SIZE, attributes: [],
    }
    const expected = {
      north: { x: 264, y: 264 },
      east: { x: 312, y: 264 },
      south: { x: 312, y: 312 },
      west: { x: 264, y: 312 },
    }
    Object.entries(expected).forEach(([side, point]) => {
      const attachment = ownerBoundaryPoint(owner, side as AttributeSide, side === 'north' || side === 'east' ? 24 : 72)
      expect(attachment).toEqual(point)
      const localX = attachment.x - owner.position.x
      const localY = attachment.y - owner.position.y
    expect(Math.abs(localX - RELATION_SIZE.width / 2) + Math.abs(localY - RELATION_SIZE.height / 2)).toBe(RELATION_SIZE.width / 2)
    })
  })

  it('uses the same projected attachment for relationship handles and attribute stems', () => {
    const diagram = baseDiagram({
      relationships: [{
        id: 'enrolls', name: 'ENROLLS', participants: [],
        attributes: [
          { id: 'grade', name: 'grade', key: false },
          { id: 'term', name: 'term', key: true },
        ],
      }],
      view: {
        ...baseDiagram().view,
        positions: { enrolls: { x: 240, y: 240 } },
        attributeLayout: { grade: { side: 'north' }, term: { side: 'north' } },
      },
    })
    const result = renderDiagram(diagram)
    const owner = result.nodes.find((node) => node.id === 'relationship:enrolls')!
    const handles = owner.data.attributeHandles as Array<{ id: string; x: number; y: number; offset: number }>
    expect(handles.map(({ offset }) => offset)).toEqual([24, 72])
    handles.forEach((handle) => {
      const attribute = result.nodes.find((node) => node.id.endsWith(`:${handle.id}`))!
      const attachment = attribute.data.attachment as { x: number; y: number }
      const terminal = attribute.data.terminal as { x: number; y: number }
      expect(attachment).toEqual({ x: owner.position.x + handle.x, y: owner.position.y + handle.y })
      expect(terminal.x).toBe(attachment.x)
      expect(terminal.y).toBeLessThan(attachment.y)
      expect(Math.abs(handle.x - RELATION_SIZE.width / 2) + Math.abs(handle.y - RELATION_SIZE.height / 2)).toBe(RELATION_SIZE.width / 2)
    })
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
    })
    const participantEdges = renderDiagram(diagram).edges.filter((edge) => edge.id.startsWith('participant-edge:'))
    expect(participantEdges).toHaveLength(3)
    expect(participantEdges.some((edge) => edge.source === 'entity:removed')).toBe(false)
  })

  it('projects participant edges only to the shared static handle contract', () => {
    const edges = renderDiagram(denseFixture()).edges.filter((edge) => edge.id.startsWith('participant-edge:'))
    const sourceIds = new Set(STATIC_HANDLE_SIDES.map((side) => staticHandleId('source', side)))
    const targetIds = new Set(STATIC_HANDLE_SIDES.map((side) => staticHandleId('target', side)))
    expect(edges.every((edge) => sourceIds.has(edge.sourceHandle!))).toBe(true)
    expect(edges.every((edge) => targetIds.has(edge.targetHandle!))).toBe(true)
    expect(positionForSide('north')).toBe(Position.Top)
    expect(positionForSide('east')).toBe(Position.Right)
    expect(positionForSide('south')).toBe(Position.Bottom)
    expect(positionForSide('west')).toBe(Position.Left)
  })

  it('keeps oversized target handles anchored to the visible boundary', () => {
    expect(connectionHandleBox('north', RELATION_SIZE.width, RELATION_SIZE.height, 44, 0)).toEqual({ left: 26, top: 0, width: 44, height: 44 })
    expect(connectionHandleBox('east', RELATION_SIZE.width, RELATION_SIZE.height, 44, 0)).toEqual({ left: 52, top: 26, width: 44, height: 44 })
    expect(connectionHandleBox('south', RELATION_SIZE.width, RELATION_SIZE.height, 44, 0)).toEqual({ left: 26, top: 52, width: 44, height: 44 })
    expect(connectionHandleBox('west', RELATION_SIZE.width, RELATION_SIZE.height, 44, 0)).toEqual({ left: 0, top: 26, width: 44, height: 44 })
  })

  it('marks gesture-created cardinalities as incomplete in the projection', () => {
    const diagram = baseDiagram({
      entities: [entity('source'), entity('target')],
      relationships: [{
        id: 'connects', name: 'CONNECTS',
        participants: [
          { entityId: 'source', cardinality: { min: 0, max: 'n' } },
          { entityId: 'target', cardinality: { min: 0, max: 'n' } },
        ],
        attributes: [],
      }],
      view: {
        ...baseDiagram().view,
        positions: {
          source: { x: 0, y: 0 }, target: { x: 384, y: 0 }, connects: { x: 192, y: 0 },
        },
        pendingCardinalities: { connects: true },
      },
    })
    const result = renderDiagram(diagram)
    expect(result.nodes.find((node) => node.id === 'relationship:connects')?.data.cardinalityPending).toBe(true)
    expect(result.edges.filter((edge) => edge.id.startsWith('participant-edge:'))
      .every((edge) => edge.data?.cardinalityPending === true)).toBe(true)
  })

  it('projects recursive participants as two distinct grid-aligned connector lanes', () => {
    const diagram = baseDiagram({
      entities: [entity('professor')],
      relationships: [{
        id: 'teaches', name: 'IMPARTE',
        participants: [
          { entityId: 'professor', cardinality: { min: 1, max: 1 } },
          { entityId: 'professor', cardinality: { min: 0, max: 'n' } },
        ],
        attributes: [],
      }],
      view: {
        ...baseDiagram().view,
        positions: { professor: { x: 0, y: 0 }, teaches: { x: 240, y: 0 } },
      },
    })
    const edges = renderDiagram(diagram).edges.filter((edge) => edge.id.startsWith('participant-edge:'))
    expect(edges).toHaveLength(2)
    expect(edges.map((edge) => edge.data?.recursiveOffset)).toEqual([-24, 24])
    expect(new Set(edges.map((edge) => edge.sourceHandle))).toEqual(new Set(['source-east']))
    expect(new Set(edges.map((edge) => edge.targetHandle))).toEqual(new Set(['target-west']))

    const source = edges.map((edge) => offsetConnectionPoint({ x: 192, y: 48 }, Position.Right, edge.data?.recursiveOffset as number, 'source'))
    const target = edges.map((edge) => offsetConnectionPoint({ x: 240, y: 48 }, Position.Left, edge.data?.recursiveOffset as number, 'target'))
    expect(source).toEqual([{ x: 192, y: 24 }, { x: 192, y: 72 }])
    expect(target).toEqual([{ x: 264, y: 24 }, { x: 264, y: 72 }])
    expect(orthogonalRoute(source[0], target[0], Position.Right, Position.Left)).toEqual([
      { x: 192, y: 24 }, { x: 264, y: 24 },
    ])
  })

  it('keeps the dense five-entity fixture aligned, attached, and non-draggable', () => {
    const diagram = denseFixture()
    const result = renderDiagram(diagram)
    const attributes = result.nodes.filter((node) => node.data.kind === 'attribute')
    const majors = result.nodes.filter((node) => node.data.kind !== 'attribute')
    const relationIds = diagram.relationships.map(({ id }) => id)

    expect(new Set(relationIds).size).toBe(relationIds.length)
    expect(diagram.relationships.filter((relationship) => relationship.participants.some(({ entityId }) => entityId === 'category'))).toHaveLength(2)
    expect(attributes).toHaveLength(34)
    expect(attributes.every((node) => node.draggable === false && node.selectable === false)).toBe(true)
    expect(majors.every((node) => node.position.x % 24 === 0 && node.position.y % 24 === 0)).toBe(true)
    expect(result.edges.filter((edge) => edge.id.startsWith('participant-edge:'))).toHaveLength(10)
    expect(new Set(result.edges.filter((edge) => edge.id.startsWith('participant-edge:')).map((edge) => edge.sourceHandle)))
      .toEqual(new Set(['source-north', 'source-east', 'source-south', 'source-west']))

    majors.forEach((owner) => {
      const handles = owner.data.attributeHandles as Array<{ id: string; side: AttributeSide; x: number; y: number; offset: number }>
      expect(new Set(handles.map(({ id }) => id)).size).toBe(handles.length)
      const bySide = handles.reduce<Partial<Record<AttributeSide, typeof handles>>>((groups, handle) => {
        const group = groups[handle.side] ?? []
        group.push(handle)
        groups[handle.side] = group
        return groups
      }, {})
      Object.values(bySide).forEach((sideHandles) => {
        if (sideHandles) expect(new Set(sideHandles.map(({ offset }) => offset)).size).toBe(sideHandles.length)
      })
      if (owner.data.kind === 'relationship') {
        handles.forEach(({ x, y }) => expect(Math.abs(x - RELATION_SIZE.width / 2) + Math.abs(y - RELATION_SIZE.height / 2)).toBe(RELATION_SIZE.width / 2))
      }
    })

    const movedDiagram = denseFixture()
    movedDiagram.view.positions.movie = { x: 120, y: 384 }
    const moved = renderDiagram(movedDiagram)
    attributes.filter((node) => node.data.ownerId === 'movie').forEach((node) => {
      const next = moved.nodes.find((candidate) => candidate.id === node.id)!
      expect(next.position).toEqual({ x: node.position.x + 48, y: node.position.y + 48 })
    })
  })

  it('reflows the stepped side cleanly after an attribute is deleted', () => {
    const make = (ids: string[]) => baseDiagram({
      entities: [{ ...entity('person'), attributes: ids.map((id) => ({ id, name: id, key: false })) }],
      view: {
        ...baseDiagram().view,
        attributeLayout: Object.fromEntries(ids.map((id) => [id, { side: 'north' as const }])),
      },
    })
    const before = renderDiagram(make(['one', 'two', 'three']))
    const after = renderDiagram(make(['one', 'three']))
    const beforeThree = before.nodes.find((node) => node.id.endsWith(':three'))!
    const afterThree = after.nodes.find((node) => node.id.endsWith(':three'))!
    expect(afterThree.data.side).toBe('north')
    expect(afterThree.data.step).toBe(1)
    expect(beforeThree.data.step).toBe(2)
    expect(afterThree.position.y).toBeGreaterThan(beforeThree.position.y)
  })

  it('moves attributes away from a side newly occupied by a relationship', () => {
    const person = {
      ...entity('person'),
      attributes: [{ id: 'person-id', name: 'id', key: true }],
    }
    const other = entity('other')
    const relationship: Diagram['relationships'][number] = {
      id: 'rel', name: 'RELATES',
      participants: [
        { entityId: 'person', cardinality: { min: 1, max: 1 } },
        { entityId: 'other', cardinality: { min: 1, max: 1 } },
      ],
      attributes: [],
    }
    const beforeMove = baseDiagram({
      entities: [person, other],
      relationships: [relationship],
      view: {
        ...baseDiagram().view,
        positions: { person: { x: 0, y: 0 }, other: { x: 600, y: 0 }, rel: { x: 240, y: 0 } },
        attributeLayout: { 'person-id': { side: 'north' } },
      },
    })
    const afterMove = {
      ...beforeMove,
      view: {
        ...beforeMove.view,
        positions: { ...beforeMove.view.positions, rel: { x: 0, y: -240 } },
      },
    }

    expect(renderDiagram(beforeMove).nodes.find((node) => node.id.endsWith(':person-id'))?.data.side)
      .toBe('north')
    expect(renderDiagram(afterMove).nodes.find((node) => node.id.endsWith(':person-id'))?.data.side)
      .not.toBe('north')
    expect(renderDiagram(afterMove).edges.find((edge) => edge.id === 'participant-edge:rel:person:0')?.sourceHandle)
      .toBe('source-north')
  })

  it('moves an attribute away from a side blocked by a nearby entity', () => {
    const person = {
      ...entity('person'),
      attributes: [{ id: 'person-id', name: 'id', key: true }],
    }
    const other = entity('other')
    const crowded = baseDiagram({
      entities: [person, other],
      view: {
        ...baseDiagram().view,
        positions: { person: { x: 0, y: 0 }, other: { x: 240, y: 0 } },
        attributeLayout: { 'person-id': { side: 'east' } },
      },
    })
    const clear = {
      ...crowded,
      view: { ...crowded.view, positions: { ...crowded.view.positions, other: { x: 480, y: 0 } } },
    }

    expect(renderDiagram(clear).nodes.find((node) => node.id.endsWith(':person-id'))?.data.side).toBe('east')
    expect(renderDiagram(crowded).nodes.find((node) => node.id.endsWith(':person-id'))?.data.side).not.toBe('east')
  })

  it('treats occupied sides as hard blockers while a free side exists', () => {
    const attributes = [{ id: 'id', name: 'id', key: true }]
    expect(allocateAttributeSides(attributes, { id: { side: 'east' } }, { east: 1 }).id)
      .not.toBe('east')
  })

  it('routes every connector orthogonally and keeps cardinality near the source', () => {
    const routes = [
      orthogonalRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, Position.Right, Position.Left),
      orthogonalRoute({ x: 0, y: 0 }, { x: 100, y: 80 }, Position.Right, Position.Left),
      orthogonalRoute({ x: 0, y: 0 }, { x: 100, y: 80 }, Position.Bottom, Position.Left),
    ]
    routes.forEach((points) => points.slice(1).forEach((point, index) => {
      const previous = points[index]
      expect(point.x === previous.x || point.y === previous.y).toBe(true)
    }))
    expect(routes[0]).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }])
    expect(cardinalityLabelPosition(routes[0])).toEqual({ x: 28, y: -12 })
    expect(cardinalityLabelPosition(orthogonalRoute(
      { x: 0, y: 0 }, { x: 100, y: 80 }, Position.Bottom, Position.Left,
    ))).toEqual({ x: 12, y: 40 })
  })
})
