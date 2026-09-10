import { describe, expect, it } from 'vitest'
import { createBlankDiagram } from './sample'
import type { Diagram, Entity } from './types'
import { projectRelationalSchema } from './relational'

const diagram = (): Diagram => ({ ...createBlankDiagram(), entities: [], relationships: [], view: { ...createBlankDiagram().view } })
const entity = (id: string, name: string, key = 'id'): Entity => ({ id, name, kind: 'strong', attributes: [{ id: `${id}-key`, name: key, key: true }] })
const add = (base: Diagram, ...items: Entity[]) => ({ ...base, entities: items })

describe('projectRelationalSchema', () => {
  it('projects 1:N in the direction of OWN cardinality', () => {
    const source = add(diagram(), entity('movie', 'Pelicula'), entity('studio', 'Estudio'))
    source.relationships = [{ id: 'made-by', name: 'produce', participants: [
      { entityId: 'movie', cardinality: { min: 1, max: 1 } },
      { entityId: 'studio', cardinality: { min: 0, max: 'n' } },
    ], attributes: [{ id: 'year', name: 'año', key: false }] }]
    const result = projectRelationalSchema(source)
    expect(result.tables.find((table) => table.id === 'entity:movie')?.columns.map((column) => column.name)).toContain('Estudio_id')
    expect(result.tables.find((table) => table.id === 'entity:movie')?.columns.map((column) => column.name)).toContain('año')
    expect(result.foreignKeys[0].tableId).toBe('entity:movie')
  })

  it('uses a join table for M:N and propagates composite keys', () => {
    const left = entity('a', 'A', 'code')
    left.attributes.push({ id: 'a-region', name: 'region', key: true })
    const source = add(diagram(), left, entity('b', 'B'))
    source.relationships = [{ id: 'rel', name: 'AB', participants: [
      { entityId: 'a', cardinality: { min: 0, max: 'n' } }, { entityId: 'b', cardinality: { min: 0, max: 'n' } },
    ], attributes: [] }]
    const result = projectRelationalSchema(source)
    expect(result.tables.find((table) => table.id === 'relationship:rel')?.uniqueKeys).toHaveLength(1)
    expect(result.foreignKeys).toHaveLength(2)
    expect(result.tables).toHaveLength(3)
  })

  it('migrates 1:1 into the mandatory side and marks its compound FK unique', () => {
    const passport = entity('passport', 'Pasaporte')
    passport.attributes.push({ id: 'passport-country', name: 'país', key: true })
    const source = add(diagram(), entity('person', 'Persona'), passport)
    source.relationships = [{ id: 'owns', name: 'tiene', participants: [
      { entityId: 'person', cardinality: { min: 1, max: 1 } }, { entityId: 'passport', cardinality: { min: 0, max: 1 } },
    ], attributes: [] }]
    const result = projectRelationalSchema(source)
    const table = result.tables.find((candidate) => candidate.id === 'entity:person')!
    expect(table.uniqueKeys).toHaveLength(2)
    expect(result.foreignKeys[0].tableId).toBe(table.id)
    expect(table.uniqueKeys[1]).toEqual(result.foreignKeys[0].columnIds)
    expect(table.columns.filter((column) => result.foreignKeys[0].columnIds.includes(column.id)).every((column) => column.nullable === false)).toBe(true)
  })

  it('creates a multivalued child table and does not mutate the diagram', () => {
    const source = add(diagram(), entity('person', 'Persona'))
    source.entities[0].attributes.push({ id: 'phone', name: 'teléfono', key: false, multivalued: true } as typeof source.entities[0]['attributes'][number])
    const before = structuredClone(source)
    const result = projectRelationalSchema(source)
    expect(result.tables.some((table) => table.id === 'attribute:phone')).toBe(true)
    expect(source).toEqual(before)
  })

  it('diagnoses missing keys and pending cardinalities without inventing keys', () => {
    const source = add(diagram(), { ...entity('a', 'A'), attributes: [] }, entity('b', 'B'))
    source.view.pendingCardinalities = { rel: true }
    source.relationships = [{ id: 'rel', name: 'R', participants: [
      { entityId: 'a', cardinality: { min: 0, max: 'n' } }, { entityId: 'b', cardinality: { min: 0, max: 'n' } },
    ], attributes: [] }]
    const result = projectRelationalSchema(source)
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.tables.flatMap((table) => table.columns).some((column) => column.primaryKey && column.sourceAttributeId?.includes('rel'))).toBe(false)
  })

  it('handles recursive 1:1 and 1:N as self foreign keys', () => {
    const source = add(diagram(), entity('person', 'Persona'))
    source.relationships = [{ id: 'manager', name: 'gestiona', participants: [
      { entityId: 'person', cardinality: { min: 1, max: 1 } }, { entityId: 'person', cardinality: { min: 0, max: 1 } },
    ], attributes: [] }, { id: 'reports', name: 'reporta', participants: [
      { entityId: 'person', cardinality: { min: 1, max: 1 } }, { entityId: 'person', cardinality: { min: 0, max: 'n' } },
    ], attributes: [] }]
    const result = projectRelationalSchema(source)
    expect(result.tables).toHaveLength(1)
    expect(result.foreignKeys).toHaveLength(2)
    expect(result.tables[0].uniqueKeys).toHaveLength(2)
  })

  it('propagates a compound parent key to flattened and multivalued columns', () => {
    const owner = entity('owner', 'Propietario')
    owner.attributes.push({ id: 'address', name: 'direccion', key: true, components: [
      { id: 'street', name: 'calle', key: false }, { id: 'number', name: 'numero', key: false },
    ] })
    owner.attributes.push({ id: 'tag', name: 'etiqueta', key: false, multivalued: true })
    const result = projectRelationalSchema(add(diagram(), owner))
    const base = result.tables.find((table) => table.id === 'entity:owner')!
    expect(base.columns.filter((column) => column.primaryKey).map((column) => column.name)).toEqual(['id', 'direccion_calle', 'direccion_numero'])
    const child = result.tables.find((table) => table.id === 'attribute:tag')!
    expect(child.columns.every((column) => column.primaryKey)).toBe(true)
    expect(child.uniqueKeys[0]).toHaveLength(4)
  })

  it('keeps generated IDs stable when labels are renamed', () => {
    const source = add(diagram(), entity('a', 'A'), entity('b', 'B'))
    source.relationships = [{ id: 'rel', name: 'R', participants: [
      { entityId: 'a', cardinality: { min: 1, max: 1 } }, { entityId: 'b', cardinality: { min: 0, max: 'n' } },
    ], attributes: [] }]
    const before = projectRelationalSchema(source)
    source.entities[0].name = 'Renamed A'
    source.entities[0].attributes[0].name = 'renamed_id'
    source.relationships[0].name = 'Renamed R'
    const after = projectRelationalSchema(source)
    expect(after.tables.map((table) => table.id)).toEqual(before.tables.map((table) => table.id))
    expect(after.tables.flatMap((table) => table.columns.map((column) => column.id))).toEqual(before.tables.flatMap((table) => table.columns.map((column) => column.id)))
    expect(after.foreignKeys.map((foreignKey) => foreignKey.id)).toEqual(before.foreignKeys.map((foreignKey) => foreignKey.id))
  })

  it('diagnoses nested multivalued components instead of scalarizing them', () => {
    const owner = entity('owner', 'Owner')
    owner.attributes.push({ id: 'profile', name: 'perfil', key: false, components: [
      { id: 'emails', name: 'emails', key: false, multivalued: true },
    ] })
    const result = projectRelationalSchema(add(diagram(), owner))
    expect(result.diagnostics.some((item) => item.sourceId === 'profile' && item.message.includes('multivaluado'))).toBe(true)
    expect(result.tables.find((table) => table.id === 'entity:owner')?.columns.some((column) => column.name.includes('emails'))).toBe(false)
  })

  it('qualifies a generated FK only when its name collides', () => {
    const movie = entity('movie', 'Pelicula', 'movie_id')
    movie.attributes.push({ id: 'studio-id', name: 'studio_id', key: false })
    const studio = entity('studio', 'Estudio', 'studio_id')
    const source = add(diagram(), movie, studio)
    source.relationships = [{ id: 'rel', name: 'produce', participants: [
      { entityId: 'movie', cardinality: { min: 1, max: 1 } }, { entityId: 'studio', cardinality: { min: 0, max: 'n' } },
    ], attributes: [] }]
    const table = projectRelationalSchema(source).tables.find((candidate) => candidate.id === 'entity:movie')!
    expect(table.columns.map((column) => column.name)).toContain('produce_Estudio_1_studio_id')
  })
})
