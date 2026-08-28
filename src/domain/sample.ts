import type { Diagram } from './types'

const sampleId = (value: string) => `sample-${value}`

/** The first-run diagram teaches the notation without requiring a tutorial. */
export const createSampleDiagram = (): Diagram => ({
  id: sampleId('diagram'),
  name: 'Mi diagrama',
  entities: [
    {
      id: sampleId('student'),
      name: 'ESTUDIANTE',
      kind: 'strong',
      attributes: [
        { id: sampleId('student-id'), name: 'estudiante_id', key: true },
        { id: sampleId('student-name'), name: 'nombre', key: false },
      ],
    },
    {
      id: sampleId('course'),
      name: 'CURSO',
      kind: 'strong',
      attributes: [
        { id: sampleId('course-id'), name: 'curso_id', key: true },
        { id: sampleId('course-title'), name: 'título', key: false },
      ],
    },
  ],
  relationships: [
    {
      id: sampleId('enrolls'),
      name: 'INSCRIBE',
      participants: [
        {
          entityId: sampleId('student'),
          cardinality: { min: 0, max: 'n' },
        },
        {
          entityId: sampleId('course'),
          cardinality: { min: 0, max: 'n' },
        },
      ],
      attributes: [{ id: sampleId('grade'), name: 'calificación', key: false }],
    },
  ],
  view: {
    renderer: 'chen-stem',
    theme: 'academic',
    positions: {
      [sampleId('student')]: { x: 120, y: 220 },
      [sampleId('enrolls')]: { x: 430, y: 260 },
      [sampleId('course')]: { x: 740, y: 220 },
    },
    layoutMode: 'structured',
    attributeLayout: {
      [sampleId('student-id')]: { side: 'north' },
      [sampleId('student-name')]: { side: 'south' },
      [sampleId('course-id')]: { side: 'north' },
      [sampleId('course-title')]: { side: 'south' },
      [sampleId('grade')]: { side: 'north' },
    },
  },
})

export const createBlankDiagram = (): Diagram => ({
  id: `diagram-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  name: 'Sin título',
  entities: [],
  relationships: [],
  view: {
    renderer: 'chen-stem',
    theme: 'academic',
    positions: {},
    layoutMode: 'structured',
    attributeLayout: {},
  },
})
