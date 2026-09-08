import { describe, expect, it, vi } from 'vitest'
import { copyActionLabel, diagramFileName } from './exportDiagram'

vi.mock('./capacitor', () => ({
  isNativePlatform: () => false,
  nativePlatformName: () => 'web' as const,
}))

describe('diagramFileName', () => {
  it('creates a filesystem-friendly name', () => {
    expect(diagramFileName('Modelo de Atención — 2026', 'png')).toBe('modelo-de-atencion-2026.png')
  })

  it('uses a fallback for an empty name', () => {
    expect(diagramFileName('   ', 'pdf')).toBe('diagrama.pdf')
  })

  it('uses the same safe naming for editable JSON files', () => {
    expect(diagramFileName('Diagrama del salón', 'json')).toBe('diagrama-del-salon.json')
  })
})

describe('copyActionLabel', () => {
  it('offers clipboard copy on web', () => {
    expect(copyActionLabel().title).toBe('Copiar como imagen')
  })
})
