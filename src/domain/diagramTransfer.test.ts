import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createSampleDiagram } from './sample'
import {
  DiagramImportError,
  parseDiagramFile,
  serializeDiagramFile,
} from './diagramTransfer'

describe('archivos de diagrama JSON', () => {
  it('round-trips the complete semantic diagram', () => {
    const diagram = createSampleDiagram()
    diagram.view.theme = 'modern'

    expect(parseDiagramFile(serializeDiagramFile(diagram))).toEqual(diagram)
  })

  it('rejects unrelated JSON files', () => {
    expect(() => parseDiagramFile('{"hello":"classmate"}')).toThrow(DiagramImportError)
    expect(() => parseDiagramFile('{not json')).toThrow('El archivo no contiene JSON válido.')
  })

  it('rejects relationships that refer to a missing entity', () => {
    const payload = JSON.parse(serializeDiagramFile(createSampleDiagram()))
    payload.diagram.relationships[0].participants[0].entityId = 'missing'

    expect(() => parseDiagramFile(JSON.stringify(payload))).toThrow(
      'El diagrama está incompleto o contiene datos no válidos.',
    )
  })

  it('rejects unsafe custom theme values', () => {
    const diagram = createSampleDiagram()
    diagram.view.theme = 'custom'
    diagram.view.customTheme = {
      background: 'url(https://example.com)',
      entity: '#ffffff',
      relationship: '#f6e3da',
      ink: '#1c1915',
      font: 'serif',
    }

    expect(() => parseDiagramFile(serializeDiagramFile(diagram))).toThrow(DiagramImportError)
  })

  it('accepts the Spanish music-platform example', () => {
    const source = readFileSync(new URL('../../examples/spotify-es.json', import.meta.url), 'utf8')
    const diagram = parseDiagramFile(source)

    expect(diagram.name).toBe('Plataforma de música')
    expect(diagram.entities.map((entity) => entity.name)).toContain('LISTA_DE_REPRODUCCIÓN')
    expect(diagram.relationships.map((relationship) => relationship.name)).toContain('ESCUCHA')
  })
})
