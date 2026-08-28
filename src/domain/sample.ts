import type { Diagram } from './types'

const sampleId = (value: string) => `sample-${value}`

/** The first-run diagram teaches the notation without requiring a tutorial. */
export const createSampleDiagram = (): Diagram => ({
  id: sampleId('diagram'),
  name: 'Mi diagrama',
  entities: [
    {
      id: sampleId('student'),
      name: 'STUDENT',
      kind: 'strong',
      attributes: [
        { id: sampleId('student-id'), name: 'student_id', key: true },
        { id: sampleId('student-name'), name: 'name', key: false },
      ],
    },
    {
      id: sampleId('course'),
      name: 'COURSE',
      kind: 'strong',
      attributes: [
        { id: sampleId('course-id'), name: 'course_id', key: true },
        { id: sampleId('course-title'), name: 'title', key: false },
      ],
    },
  ],
  relationships: [
    {
      id: sampleId('enrolls'),
      name: 'ENROLLS',
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
      attributes: [{ id: sampleId('grade'), name: 'grade', key: false }],
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
  },
})

