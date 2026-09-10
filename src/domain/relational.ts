import type { Attribute, Diagram, Entity, Relationship } from './types'

export type RelationalColumn = {
  id: string
  name: string
  primaryKey: boolean
  nullable?: boolean
  sourceAttributeId?: string
}

export type RelationalTable = {
  id: string
  name: string
  source: { type: 'entity' | 'relationship'; id: string }
  columns: RelationalColumn[]
  uniqueKeys: string[][]
}

export type RelationalForeignKey = {
  id: string
  tableId: string
  columnIds: string[]
  referencedTableId: string
  referencedColumnIds: string[]
}

export type RelationalDiagnostic = { id: string; sourceId: string; message: string }

export type RelationalSchema = {
  tables: RelationalTable[]
  foreignKeys: RelationalForeignKey[]
  diagnostics: RelationalDiagnostic[]
}

type MutableTable = RelationalTable & { keyColumns: RelationalColumn[] }
type PendingMulti = { owner: MutableTable; attribute: Attribute; sourceId: string }

const segment = (value: string) => encodeURIComponent(value)
const idFor = (kind: string, ...parts: string[]) => `${kind}:${parts.map(segment).join(':')}`
const leaves = (attribute: Attribute, prefix = attribute.name, inheritedKey = attribute.key): Array<{ name: string; id: string; key: boolean }> => {
  const components = attribute.components ?? []
  if (!components.length) return [{ name: prefix, id: attribute.id, key: inheritedKey }]
  return components.flatMap((component) => component.multivalued
    ? []
    : leaves(component, `${prefix}_${component.name}`, inheritedKey || component.key))
}

const nestedMultivalued = (attribute: Attribute): Attribute | undefined =>
  (attribute.components ?? []).reduce<Attribute | undefined>((found, component) =>
    found ?? (component.multivalued ? component : nestedMultivalued(component)), undefined)
const uniqueName = (table: MutableTable, wanted: string) => {
  const base = wanted.trim() || 'columna'
  let name = base
  let suffix = 2
  while (table.columns.some((column) => column.name === name)) name = `${base}_${suffix++}`
  return name
}

export function projectRelationalSchema(diagram: Diagram): RelationalSchema {
  const tables: MutableTable[] = []
  const foreignKeys: RelationalForeignKey[] = []
  const diagnostics: RelationalDiagnostic[] = []
  const pendingMulti: PendingMulti[] = []
  const entityTables = new Map<string, MutableTable>()
  const diagnostic = (sourceId: string, message: string, suffix = String(diagnostics.length)) =>
    diagnostics.push({ id: idFor('diagnostic', sourceId, suffix), sourceId, message })

  const addColumn = (table: MutableTable, name: string, sourceAttributeId: string, primaryKey: boolean, nullable?: boolean) => {
    const column: RelationalColumn = {
      id: idFor('column', table.id, sourceAttributeId),
      name: uniqueName(table, name),
      primaryKey,
      ...(nullable === undefined ? {} : { nullable }),
      sourceAttributeId,
    }
    table.columns.push(column)
    if (primaryKey) table.keyColumns.push(column)
    return column
  }

  const addAttributeColumns = (table: MutableTable, attributes: Attribute[], sourceId: string, honorKeys = true) => {
    attributes.forEach((attribute) => {
      if (attribute.multivalued) {
        pendingMulti.push({ owner: table, attribute, sourceId })
        return
      }
      const nested = nestedMultivalued(attribute)
      if (nested) diagnostic(attribute.id, `El componente multivaluado «${nested.name}» de «${attribute.name}» no se puede aplanar como columna escalar.`)
      leaves(attribute).forEach((leaf) => addColumn(table, leaf.name, leaf.id, honorKeys && leaf.key))
    })
  }

  const entityTable = (entity: Entity): MutableTable => {
    const existing = entityTables.get(entity.id)
    if (existing) return existing
    const table: MutableTable = {
      id: `entity:${segment(entity.id)}`,
      name: entity.name,
      source: { type: 'entity', id: entity.id },
      columns: [],
      uniqueKeys: [],
      keyColumns: [],
    }
    entityTables.set(entity.id, table)
    tables.push(table)
    addAttributeColumns(table, entity.attributes, entity.id)
    if (entity.kind === 'weak') diagnostic(entity.id, `La entidad débil «${entity.name}» no identifica su entidad propietaria; no se hereda una clave automáticamente.`)
    if (!table.keyColumns.length) diagnostic(entity.id, `La entidad «${entity.name}» no tiene atributos clave; no se pueden derivar referencias.`)
    else table.uniqueKeys.push(table.keyColumns.map((column) => column.id))
    return table
  }
  diagram.entities.forEach(entityTable)

  const addForeignKey = (table: MutableTable, referenced: MutableTable, displayRole: string, nullable: boolean, sourceId: string, primaryKey = false, identityRole = displayRole) => {
    if (!referenced.keyColumns.length) {
      diagnostic(sourceId, `La relación no puede crear una clave foránea hacia «${referenced.name}» porque no tiene clave.`)
      return []
    }
    const columns = referenced.keyColumns.map((key) => {
      const generic = key.name.trim().toLowerCase() === 'id'
      const baseName = generic ? `${referenced.name}_${key.name}` : key.name
      const displayName = table.columns.some((column) => column.name === baseName)
        ? `${displayRole}_${baseName}`
        : baseName
      return addColumn(table, displayName, idFor('generated', sourceId, identityRole, key.id), primaryKey, nullable)
    })
    foreignKeys.push({ id: idFor('foreign-key', table.id, sourceId, identityRole), tableId: table.id, columnIds: columns.map((column) => column.id), referencedTableId: referenced.id, referencedColumnIds: referenced.keyColumns.map((column) => column.id) })
    return columns
  }

  const relationshipTable = (relationship: Relationship): MutableTable => {
    const table: MutableTable = { id: `relationship:${segment(relationship.id)}`, name: relationship.name, source: { type: 'relationship', id: relationship.id }, columns: [], uniqueKeys: [], keyColumns: [] }
    tables.push(table)
    const canUseCompositeKey = relationship.participants.every((participant) => (entityTables.get(participant.entityId)?.keyColumns.length ?? 0) > 0)
    relationship.participants.forEach((participant, index) => {
      const target = entityTables.get(participant.entityId)
      if (!target) return
      const columns = addForeignKey(table, target, `${relationship.name}_${target.name}_${index + 1}`, false, relationship.id, canUseCompositeKey, `participant-${index}`)
      if (columns.length && !canUseCompositeKey) table.keyColumns.length = 0
    })
    addAttributeColumns(table, relationship.attributes, relationship.id, false)
    if (canUseCompositeKey && table.keyColumns.length === relationship.participants.reduce((sum, participant) => sum + (entityTables.get(participant.entityId)?.keyColumns.length ?? 0), 0)) table.uniqueKeys.push(table.keyColumns.map((column) => column.id))
    return table
  }

  const processRelationship = (relationship: Relationship) => {
    const participants = relationship.participants
    const pending = diagram.view.pendingCardinalities?.[relationship.id]
    if (pending) diagnostic(relationship.id, `La relación «${relationship.name}» tiene cardinalidades pendientes; se proyecta conservadoramente como tabla intermedia.`)
    if (participants.length !== 2 || pending) {
      if (participants.length > 2) diagnostic(relationship.id, `La relación «${relationship.name}» es ternaria o n-aria; se conserva como tabla intermedia y sus restricciones de cardinalidad requieren revisión.`)
      relationshipTable(relationship)
      return
    }
    const [first, second] = participants
    const left = entityTables.get(first.entityId)
    const right = entityTables.get(second.entityId)
    if (!left || !right) return
    if (first.cardinality.max === 1 && second.cardinality.max === 1) {
      const recipientIndex = first.cardinality.min === 1 && second.cardinality.min !== 1 ? 0 : second.cardinality.min === 1 && first.cardinality.min !== 1 ? 1 : 0
      const recipient = recipientIndex === 0 ? left : right
      const target = recipientIndex === 0 ? right : left
      const recipientParticipant = participants[recipientIndex]
      const migrated = addForeignKey(recipient, target, `${relationship.name}_${target.name}_${recipientIndex + 1}`, recipientParticipant.cardinality.min === 0, relationship.id, false, `participant-${recipientIndex}`)
      if (migrated.length) recipient.uniqueKeys.push(migrated.map((column) => column.id))
      addAttributeColumns(recipient, relationship.attributes, relationship.id, false)
      return
    }
    if ((first.cardinality.max === 1) !== (second.cardinality.max === 1)) {
      const recipientIndex = first.cardinality.max === 1 ? 0 : 1
      const recipient = recipientIndex === 0 ? left : right
      const target = recipientIndex === 0 ? right : left
      const recipientParticipant = participants[recipientIndex]
      addForeignKey(recipient, target, `${relationship.name}_${target.name}_${recipientIndex + 1}`, recipientParticipant.cardinality.min === 0, relationship.id, false, `participant-${recipientIndex}`)
      addAttributeColumns(recipient, relationship.attributes, relationship.id, false)
      return
    }
    relationshipTable(relationship)
  }
  diagram.relationships.forEach(processRelationship)

  pendingMulti.forEach(({ owner, attribute, sourceId }) => {
    const child: MutableTable = { id: `attribute:${segment(attribute.id)}`, name: `${owner.name}_${attribute.name}`, source: { type: owner.source.type, id: sourceId }, columns: [], uniqueKeys: [], keyColumns: [] }
    tables.push(child)
    const nested = nestedMultivalued(attribute)
    if (nested) diagnostic(attribute.id, `El atributo multivaluado «${attribute.name}» contiene componentes anidados; revise su tabla derivada.`)
    const ownerColumns = owner.keyColumns.map((key) => addColumn(child, key.name, idFor('owner', attribute.id, key.id), true, false))
    const valueColumns = leaves(attribute).map((leaf) => addColumn(child, leaf.name, leaf.id, Boolean(owner.keyColumns.length), false))
    if (!owner.keyColumns.length) { diagnostic(attribute.id, `El atributo multivaluado «${attribute.name}» no se puede relacionar sin una clave del propietario.`); return }
    child.uniqueKeys.push([...ownerColumns.map((column) => column.id), ...valueColumns.map((column) => column.id)])
    foreignKeys.push({ id: idFor('foreign-key', child.id, 'owner'), tableId: child.id, columnIds: ownerColumns.map((column) => column.id), referencedTableId: owner.id, referencedColumnIds: owner.keyColumns.map((column) => column.id) })
  })
  const publicTables = tables.map((table): RelationalTable => ({
    id: table.id,
    name: table.name,
    source: table.source,
    columns: table.columns,
    uniqueKeys: table.uniqueKeys,
  }))
  return { tables: publicTables, foreignKeys, diagnostics }
}
