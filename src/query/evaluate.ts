import type { Condition, Group, Node } from './model'
import { getProperty } from '../data/properties'
import type { ParticipantRecord, RecordValue } from '../data/records'

/**
 * Decide whether a record matches the query tree. This is the runtime twin of
 * summary.ts: the same operator semantics, evaluated against data instead of
 * rendered as words.
 *
 * Guiding rule for partial states: an **incomplete** condition (no property,
 * or an operator with no value yet) adds **no constraint** — it matches every
 * record — mirroring how the summary shows such clauses as unfinished rather
 * than breaking. So the startup query (one blank condition) matches everyone.
 */

export function matchesGroup(record: ParticipantRecord, group: Group): boolean {
  if (group.children.length === 0) return true // empty group constrains nothing
  const results = group.children.map((child) => matchesNode(record, child))
  const res =
    group.combinator === 'AND' ? results.every(Boolean) : results.some(Boolean)
  return group.exclude ? !res : res
}

function matchesNode(record: ParticipantRecord, node: Node): boolean {
  return node.kind === 'group' ? matchesGroup(record, node) : matchesCondition(record, node)
}

/** True when a record actually has a value for a property (presence test). */
function hasValue(value: RecordValue): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value !== ''
  return true
}

function matchesCondition(record: ParticipantRecord, cond: Condition): boolean {
  if (!cond.propertyId) return true // no property chosen → no constraint
  const property = getProperty(cond.propertyId)
  if (!property) return true
  const value = record.values[cond.propertyId] ?? null

  // Presence operators are kind-independent.
  if (cond.op === 'hasValue') return hasValue(value)
  if (cond.op === 'noValue') return !hasValue(value)

  switch (property.kind) {
    case 'enum': {
      const have = Array.isArray(value) ? value : []
      if (cond.valueIds.length === 0) return true // no values picked → no constraint
      switch (cond.op) {
        case 'all':
          return cond.valueIds.every((v) => have.includes(v))
        case 'none':
          return !cond.valueIds.some((v) => have.includes(v))
        default: // 'any'
          return cond.valueIds.some((v) => have.includes(v))
      }
    }
    case 'boolean':
      if (cond.bool == null) return true
      return value === cond.bool
    case 'range': {
      const n = typeof value === 'number' ? value : null
      const { min, max } = cond.range
      switch (cond.op) {
        case 'gt':
          return min == null ? true : n != null && n > min
        case 'gte':
          return min == null ? true : n != null && n >= min
        case 'lt':
          return max == null ? true : n != null && n < max
        case 'lte':
          return max == null ? true : n != null && n <= max
        default: // 'between' (one-sided bounds degrade to >= / <=)
          if (min == null && max == null) return true
          if (n == null) return false
          return (min == null || n >= min) && (max == null || n <= max)
      }
    }
    case 'text': {
      if (cond.text == null || cond.text === '') return true
      if (typeof value !== 'string') return false
      const hay = value.toLowerCase()
      const needle = cond.text.toLowerCase()
      switch (cond.op) {
        case 'startsWith':
          return hay.startsWith(needle)
        case 'endsWith':
          return hay.endsWith(needle)
        case 'equals':
          return hay === needle
        default: // 'contains'
          return hay.includes(needle)
      }
    }
  }
}

/** Count records matching the query. */
export function countMatches(records: ParticipantRecord[], group: Group): number {
  let n = 0
  for (const r of records) if (matchesGroup(r, group)) n++
  return n
}

/** The matching records (all of them; the UI slices for its preview). */
export function filterRecords(records: ParticipantRecord[], group: Group): ParticipantRecord[] {
  return records.filter((r) => matchesGroup(r, group))
}
