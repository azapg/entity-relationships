import type { Attribute, Diagram } from './types'

const caseId = (value: string) => `case6-${value}`
const sampleId = (value: string) => `sample-${value}`

const attribute = (
  owner: string,
  name: string,
  options: Partial<Pick<Attribute, 'key' | 'multivalued' | 'components'>> = {},
): Attribute => ({
  id: caseId(`${owner}-${name}`),
  name,
  key: false,
  ...options,
})

const periodAttribute = (owner: string): Attribute => attribute(owner, 'periodo', {
  multivalued: true,
  components: [
    attribute(`${owner}-periodo`, 'fecha_inicio'),
    attribute(`${owner}-periodo`, 'fecha_fin'),
  ],
})

/** Caso 6 is both a complete answer and a compact, editable tour of the EER notation. */
export const createCase6Diagram = (): Diagram => ({
  id: caseId('diagram'),
  name: 'Caso 6 · Proyectos de investigación',
  entities: [
    {
      id: caseId('proyecto'),
      name: 'PROYECTO',
      kind: 'strong',
      attributes: [
        attribute('proyecto', 'id_proyecto', { key: true }),
        attribute('proyecto', 'nombre'),
        attribute('proyecto', 'presupuesto_total'),
        attribute('proyecto', 'programa_I+D'),
        attribute('proyecto', 'fecha_inicio'),
        attribute('proyecto', 'fecha_fin'),
        attribute('proyecto', 'descripción'),
      ],
    },
    {
      id: caseId('profesor'),
      name: 'PROFESOR',
      kind: 'strong',
      attributes: [
        attribute('profesor', 'id_profesor', { key: true }),
        attribute('profesor', 'nombre'),
        attribute('profesor', 'apellidos'),
        attribute('profesor', 'despacho'),
        attribute('profesor', 'teléfono'),
      ],
    },
    { id: caseId('doctor'), name: 'DOCTOR', kind: 'strong', attributes: [] },
    { id: caseId('no-doctor'), name: 'NO DOCTOR', kind: 'strong', attributes: [] },
    {
      id: caseId('publicacion'),
      name: 'PUBLICACIÓN',
      kind: 'strong',
      attributes: [
        attribute('publicacion', 'código', { key: true }),
        attribute('publicacion', 'título'),
      ],
    },
    {
      id: caseId('revista'),
      name: 'REVISTA',
      kind: 'strong',
      attributes: [
        attribute('revista', 'volumen'),
        attribute('revista', 'número'),
        attribute('revista', 'página_inicio'),
        attribute('revista', 'página_fin'),
      ],
    },
    {
      id: caseId('congreso'),
      name: 'CONGRESO',
      kind: 'strong',
      attributes: [
        attribute('congreso', 'tipo_congreso'),
        attribute('congreso', 'ciudad'),
        attribute('congreso', 'país'),
        attribute('congreso', 'fecha_inicio'),
        attribute('congreso', 'fecha_fin'),
        attribute('congreso', 'editorial'),
      ],
    },
  ],
  relationships: [
    {
      id: caseId('trabaja'),
      name: 'TRABAJA',
      participants: [
        { entityId: caseId('profesor'), cardinality: { min: 0, max: 'n' } },
        { entityId: caseId('proyecto'), cardinality: { min: 1, max: 'n' } },
      ],
      // A multivalued, compound period preserves repeated work intervals for
      // the same professor/project pair without inventing a second entity.
      attributes: [periodAttribute('trabaja')],
    },
    {
      id: caseId('dirige'),
      name: 'DIRIGE',
      participants: [
        { entityId: caseId('doctor'), cardinality: { min: 0, max: 'n' } },
        { entityId: caseId('proyecto'), cardinality: { min: 1, max: 1 } },
      ],
      attributes: [],
    },
    {
      id: caseId('supervisa'),
      name: 'SUPERVISA',
      participants: [
        { entityId: caseId('doctor'), cardinality: { min: 0, max: 'n' } },
        { entityId: caseId('no-doctor'), cardinality: { min: 1, max: 'n' } },
      ],
      attributes: [periodAttribute('supervisa')],
    },
    {
      id: caseId('escribe'),
      name: 'ESCRIBE',
      participants: [
        { entityId: caseId('profesor'), cardinality: { min: 0, max: 'n' } },
        { entityId: caseId('publicacion'), cardinality: { min: 1, max: 'n' } },
      ],
      attributes: [],
    },
  ],
  generalizations: [
    {
      id: caseId('tipo-profesor'),
      supertypeId: caseId('profesor'),
      subtypeIds: [caseId('doctor'), caseId('no-doctor')],
      completeness: 'total',
      disjointness: 'exclusive',
    },
    {
      id: caseId('tipo-publicacion'),
      supertypeId: caseId('publicacion'),
      subtypeIds: [caseId('revista'), caseId('congreso')],
      completeness: 'total',
      disjointness: 'exclusive',
    },
  ],
  view: {
    renderer: 'chen-stem',
    theme: 'academic',
    cardinalityPlacement: 'near-entity',
    positions: {
      [caseId('proyecto')]: { x: -720, y: 0 },
      [caseId('trabaja')]: { x: -360, y: 0 },
      [caseId('profesor')]: { x: 0, y: 0 },
      [caseId('escribe')]: { x: 432, y: 0 },
      [caseId('publicacion')]: { x: 720, y: 0 },
      [caseId('tipo-profesor')]: { x: 60, y: 240 },
      [caseId('doctor')]: { x: -240, y: 432 },
      [caseId('no-doctor')]: { x: 360, y: 432 },
      [caseId('dirige')]: { x: -480, y: 288 },
      [caseId('supervisa')]: { x: 60, y: 648 },
      [caseId('tipo-publicacion')]: { x: 780, y: 240 },
      [caseId('revista')]: { x: 600, y: 432 },
      [caseId('congreso')]: { x: 1032, y: 432 },
    },
    layoutMode: 'structured',
    attributeLayout: {
      [caseId('proyecto-id_proyecto')]: { side: 'north' },
      [caseId('proyecto-nombre')]: { side: 'north' },
      [caseId('proyecto-presupuesto_total')]: { side: 'north' },
      [caseId('proyecto-programa_I+D')]: { side: 'north' },
      [caseId('proyecto-fecha_inicio')]: { side: 'west' },
      [caseId('proyecto-fecha_fin')]: { side: 'west' },
      [caseId('proyecto-descripción')]: { side: 'west' },
      [caseId('profesor-id_profesor')]: { side: 'north' },
      [caseId('profesor-nombre')]: { side: 'north' },
      [caseId('profesor-apellidos')]: { side: 'north' },
      [caseId('profesor-despacho')]: { side: 'north' },
      [caseId('profesor-teléfono')]: { side: 'north' },
      [caseId('publicacion-código')]: { side: 'north' },
      [caseId('publicacion-título')]: { side: 'north' },
      [caseId('revista-volumen')]: { side: 'west' },
      [caseId('revista-número')]: { side: 'west' },
      [caseId('revista-página_inicio')]: { side: 'south' },
      [caseId('revista-página_fin')]: { side: 'south' },
      [caseId('congreso-tipo_congreso')]: { side: 'east' },
      [caseId('congreso-ciudad')]: { side: 'east' },
      [caseId('congreso-país')]: { side: 'east' },
      [caseId('congreso-fecha_inicio')]: { side: 'south' },
      [caseId('congreso-fecha_fin')]: { side: 'south' },
      [caseId('congreso-editorial')]: { side: 'south' },
      [caseId('trabaja-periodo')]: { side: 'north' },
      [caseId('supervisa-periodo')]: { side: 'south' },
    },
  },
})

/** Small notation sample retained for existing diagrams and migration tests. */
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
  relationships: [{
    id: sampleId('enrolls'),
    name: 'INSCRIBE',
    participants: [
      { entityId: sampleId('student'), cardinality: { min: 0, max: 'n' } },
      { entityId: sampleId('course'), cardinality: { min: 0, max: 'n' } },
    ],
    attributes: [{ id: sampleId('grade'), name: 'calificación', key: false }],
  }],
  generalizations: [],
  view: {
    renderer: 'chen-stem',
    theme: 'academic',
    cardinalityPlacement: 'near-entity',
    positions: {
      [sampleId('student')]: { x: 120, y: 216 },
      [sampleId('enrolls')]: { x: 432, y: 264 },
      [sampleId('course')]: { x: 744, y: 216 },
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
  generalizations: [],
  view: {
    renderer: 'chen-stem',
    theme: 'academic',
    cardinalityPlacement: 'near-entity',
    positions: {},
    layoutMode: 'structured',
    attributeLayout: {},
  },
})
