import { describe, expect, it } from 'vitest'
import { diagramFileName } from './exportDiagram'

describe('diagramFileName', () => {
  it('creates a filesystem-friendly name', () => {
    expect(diagramFileName('Modelo de Atención — 2026', 'png')).toBe('modelo-de-atencion-2026.png')
  })

  it('uses a fallback for an empty name', () => {
    expect(diagramFileName('   ', 'pdf')).toBe('diagrama.pdf')
  })
})
