import type { Condition, Group, Node } from './model'
import { getProperty } from '../data/properties'

/**
 * Render the query tree as a plain-English expression, e.g.
 *   (Class is any of Mammal, Bird) AND NOT (Habitat is any of Desert)
 *
 * This is the "legibility" backstop: whatever the visual layout does, the
 * reader can always confirm the logic in one sentence.
 */
export function summarize(root: Group): string {
  const body = summarizeGroup(root)
  return body || 'No conditions yet.'
}

function summarizeNode(node: Node): string {
  return node.kind === 'condition' ? summarizeCondition(node) : summarizeGroup(node, true)
}

function summarizeGroup(group: Group, parenthesize = false): string {
  const parts = group.children.map(summarizeNode).filter(Boolean)
  if (parts.length === 0) return group.exclude ? 'NOT (…)' : ''

  const joiner = ` ${group.combinator} `
  let text = parts.join(joiner)
  // The root reads without outer parens; nested groups (and any excluded
  // group, whose NOT needs an unambiguous scope) keep them.
  if (parenthesize || group.exclude) text = `(${text})`
  if (group.exclude) text = `NOT ${text}`
  return text
}

function summarizeCondition(cond: Condition): string {
  const property = cond.propertyId ? getProperty(cond.propertyId) : undefined
  if (!property) return '(unset condition)'

  // Presence operators test the property itself — kind-independent.
  if (cond.op === 'hasValue') return `${property.label} has a value`
  if (cond.op === 'noValue') return `${property.label} has no value`

  switch (property.kind) {
    case 'enum': {
      const labels = cond.valueIds
        .map((id) => property.values.find((v) => v.id === id)?.label)
        .filter((l): l is string => !!l)
      if (labels.length === 0) return `${property.label} (no values)`
      return `${property.label} ${ENUM_PHRASE[cond.op] ?? 'is any of'} ${labels.join(', ')}`
    }
    case 'boolean': {
      if (cond.bool == null) return `${property.label} (no value)`
      return `${property.label} is ${cond.bool ? 'Yes' : 'No'}`
    }
    case 'range': {
      const { min, max } = cond.range
      const unit = property.unit ? ` ${property.unit}` : ''
      if (cond.op === 'between') {
        if (min == null && max == null) return `${property.label} (no value)`
        if (min != null && max != null)
          return `${property.label} is between ${min} and ${max}${unit}`
        if (min != null) return `${property.label} is at least ${min}${unit}`
        return `${property.label} is at most ${max}${unit}`
      }
      // One-sided comparisons keep their value in min (gt/gte) or max (lt/lte).
      const bound = cond.op === 'gt' || cond.op === 'gte' ? min : max
      if (bound == null) return `${property.label} (no value)`
      return `${property.label} ${RANGE_PHRASE[cond.op] ?? 'is'} ${bound}${unit}`
    }
    case 'text': {
      if (cond.text == null) return `${property.label} (no value)`
      return `${property.label} ${TEXT_PHRASE[cond.op] ?? 'contains'} "${cond.text}"`
    }
    case 'date': {
      const { min, max } = cond.date
      if (cond.op === 'between') {
        if (min == null && max == null) return `${property.label} (no value)`
        if (min != null && max != null) return `${property.label} is between ${min} and ${max}`
        if (min != null) return `${property.label} is on or after ${min}`
        return `${property.label} is on or before ${max}`
      }
      // 'on'/'after' keep their value in min, 'before' in max.
      const bound = cond.op === 'before' ? max : min
      if (bound == null) return `${property.label} (no value)`
      return `${property.label} ${DATE_PHRASE[cond.op] ?? 'is on'} ${bound}`
    }
  }
}

const ENUM_PHRASE: Partial<Record<Condition['op'], string>> = {
  any: 'is any of',
  all: 'is all of',
  none: 'is none of',
}

const RANGE_PHRASE: Partial<Record<Condition['op'], string>> = {
  gt: 'is greater than',
  lt: 'is less than',
  gte: 'is at least',
  lte: 'is at most',
}

const TEXT_PHRASE: Partial<Record<Condition['op'], string>> = {
  contains: 'contains',
  startsWith: 'starts with',
  endsWith: 'ends with',
  equals: 'is exactly',
}

const DATE_PHRASE: Partial<Record<Condition['op'], string>> = {
  on: 'is on',
  before: 'is before',
  after: 'is after',
}
