import type { Cardinality } from './types'
import { cardinalityLabel } from './types'

export type CardinalityMeaning = {
  code: string
  participation: 'Opcional' | 'Obligatoria'
  multiplicity: 'Única' | 'Múltiple'
  sentence: string
}

export function parseCardinalityLabel(label: string): Cardinality {
  const match = /^\((0|1),(1|n)\)$/.exec(label)
  if (!match) throw new Error(`Invalid cardinality label: ${label}`)
  return {
    min: match[1] === '1' ? 1 : 0,
    max: match[2] === '1' ? 1 : 'n',
  }
}

/** Describe the participation of one role in a relationship. */
export function cardinalityDescription(
  roleName: string,
  relationshipName: string,
  cardinality: Cardinality,
) {
  const { min, max } = cardinality

  let participation: string

  if (min === 0 && max === 1) {
    participation = 'puede participar cero o una vez'
  } else if (min === 1 && max === 1) {
    participation = 'debe participar exactamente una vez'
  } else if (min === 0 && max === 'n') {
    participation = 'puede participar cero o muchas veces'
  } else {
    participation = 'debe participar una o muchas veces'
  }

  return `Cada instancia de ${roleName} ${participation} en la relación “${relationshipName}”.`
}

/** Describe one participant only. Keeping this pure prevents the UI from
 * accidentally borrowing the other participant's cardinality state. */
export const describeCardinality = (
  value: Cardinality,
  roleName: string,
  relationshipName: string,
): CardinalityMeaning => {
  const participation = value.min === 0 ? 'Opcional' : 'Obligatoria'
  const multiplicity = value.max === 1 ? 'Única' : 'Múltiple'
  return {
    code: cardinalityLabel(value),
    participation,
    multiplicity,
    sentence: cardinalityDescription(roleName, relationshipName, value),
  }
}
