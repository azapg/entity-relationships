import { describe, expect, it } from 'vitest'
import { cardinalityDescription, describeCardinality, parseCardinalityLabel } from './cardinality'

describe('parseCardinalityLabel', () => {
  it('normalizes all four dropdown values to typed cardinalities', () => {
    expect(parseCardinalityLabel('(0,1)')).toEqual({ min: 0, max: 1 })
    expect(parseCardinalityLabel('(1,1)')).toEqual({ min: 1, max: 1 })
    expect(parseCardinalityLabel('(0,n)')).toEqual({ min: 0, max: 'n' })
    expect(parseCardinalityLabel('(1,n)')).toEqual({ min: 1, max: 'n' })
  })
})

describe('cardinalityDescription', () => {
  it('describes each participant from its own cardinality', () => {
    expect(cardinalityDescription('padre', 'tiene', { min: 1, max: 1 })).toBe(
      'Cada instancia de padre debe participar exactamente una vez en la relación “tiene”.',
    )
    expect(cardinalityDescription('hijo', 'tiene', { min: 0, max: 'n' })).toBe(
      'Cada instancia de hijo puede participar cero o muchas veces en la relación “tiene”.',
    )
  })
})

describe('describeCardinality', () => {
  it('(0,1) is optional and single', () => {
    expect(describeCardinality({ min: 0, max: 1 }, 'padre', 'tiene')).toEqual({
      code: '(0,1)',
      participation: 'Opcional',
      multiplicity: 'Única',
      sentence: 'Cada instancia de padre puede participar cero o una vez en la relación “tiene”.',
    })
  })

  it('(1,1) is required and single', () => {
    expect(describeCardinality({ min: 1, max: 1 }, 'hijo', 'pertenece')).toEqual({
      code: '(1,1)',
      participation: 'Obligatoria',
      multiplicity: 'Única',
      sentence: 'Cada instancia de hijo debe participar exactamente una vez en la relación “pertenece”.',
    })
  })

  it('(0,n) is optional and multiple', () => {
    expect(describeCardinality({ min: 0, max: 'n' }, 'autor', 'escribe')).toEqual({
      code: '(0,n)',
      participation: 'Opcional',
      multiplicity: 'Múltiple',
      sentence: 'Cada instancia de autor puede participar cero o muchas veces en la relación “escribe”.',
    })
  })

  it('(1,n) is required and multiple', () => {
    expect(describeCardinality({ min: 1, max: 'n' }, 'libro', 'contiene')).toEqual({
      code: '(1,n)',
      participation: 'Obligatoria',
      multiplicity: 'Múltiple',
      sentence: 'Cada instancia de libro debe participar una o muchas veces en la relación “contiene”.',
    })
  })
})
