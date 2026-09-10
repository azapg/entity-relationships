import { describe, expect, it } from 'vitest'
import { createSampleDiagram } from '../../domain/sample'
import { renderRelationalDiagram } from './renderDiagram'

describe('relational renderer', () => {
  it('keeps generated join table and every FK pair addressable by stable handles', () => {
    const diagram = createSampleDiagram()
    const rendered = renderRelationalDiagram(diagram)
    const join = rendered.nodes.find((node) => node.data.generated)
    expect(join?.id).toBe('table:relationship:sample-enrolls')
    const foreignKeys = rendered.edges.filter((edge) => edge.type === 'relationalForeignKey')
    expect(foreignKeys).toHaveLength(2)
    foreignKeys.forEach((edge) => {
      expect(edge.sourceHandle).toMatch(/^source:column:/)
      expect(edge.targetHandle).toMatch(/^target:column:/)
    })
  })

  it('allocates distinct vertical bands for tall table rows', () => {
    const diagram = createSampleDiagram()
    diagram.entities = Array.from({ length: 6 }, (_, index) => ({
      id: `entity-${index}`,
      name: `Entidad ${index}`,
      kind: 'strong' as const,
      attributes: Array.from({ length: index === 0 ? 12 : 1 }, (_, column) => ({ id: `attribute-${index}-${column}`, name: `columna_${column}`, key: column === 0 })),
    }))
    diagram.relationships = []
    const rendered = renderRelationalDiagram(diagram)
    const firstRow = rendered.nodes.slice(0, 3)
    const secondRow = rendered.nodes.slice(3, 6)
    expect(Math.min(...secondRow.map((node) => node.position.y))).toBeGreaterThan(Math.max(...firstRow.map((node) => node.position.y + (node.height ?? 0))))
  })

  it('allocates extra geometry for long schema names instead of clipping them', () => {
    const diagram = createSampleDiagram()
    diagram.entities[0].name = 'Entidad con un nombre descriptivo muy largo'
    diagram.entities[0].attributes[0].name = 'identificador_compuesto_de_registro_historico'
    diagram.relationships = []
    const table = renderRelationalDiagram(diagram).nodes.find((node) => node.data.tableId === 'entity:sample-student')
    expect(table?.height).toBeGreaterThan(38 + 30 * 2)
    expect(table?.data.rowHeights?.[table.data.columns?.[0]?.id ?? '']).toBeGreaterThan(30)
  })

  it('measures unique constraints using displayed column names', () => {
    const diagram = createSampleDiagram()
    diagram.entities[0].name = 'A'
    diagram.entities[0].id = 'entity-with-a-very-long-internal-identifier-for-ficha'
    diagram.entities[0].attributes = [{ id: 'attribute-with-a-very-long-internal-identifier-for-recipient', name: 'id', key: true }]
    diagram.entities[1].name = 'B'
    diagram.entities[1].id = 'entity-with-a-very-long-internal-identifier-for-idioma'
    diagram.entities[1].attributes = [
      { id: 'attribute-with-a-very-long-internal-identifier-for-ficha', name: 'ID_Ficha', key: true },
      { id: 'attribute-with-a-very-long-internal-identifier-for-idioma', name: 'Idioma', key: true },
    ]
    diagram.relationships[0].name = 'R'
    diagram.relationships[0].participants = [
      { entityId: diagram.entities[0].id, cardinality: { min: 1, max: 1 } },
      { entityId: diagram.entities[1].id, cardinality: { min: 0, max: 1 } },
    ]
    diagram.relationships[0].attributes = []
    const table = renderRelationalDiagram(diagram).nodes.find((node) => node.data.semanticId === diagram.entities[0].id)
    const key = table?.data.uniqueConstraints?.find((candidate) => candidate.length > 1)
    expect(key).toBeDefined()
    expect(table?.data.constraintHeights?.[key?.join(',') ?? '']).toBe(24)
    expect(table?.height).toBe(38 + 30 * 3 + 24)
  })
})
