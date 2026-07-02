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

  switch (property.kind) {
    case 'enum': {
      const labels = cond.valueIds
        .map((id) => property.values.find((v) => v.id === id)?.label)
        .filter((l): l is string => !!l)
      if (labels.length === 0) return `${property.label} (no values)`
      return `${property.label} ${OP_PHRASE[cond.op]} ${labels.join(', ')}`
    }
    case 'boolean': {
      if (cond.bool == null) return `${property.label} (no value)`
      return `${property.label} is ${cond.bool ? 'Yes' : 'No'}`
    }
    case 'range': {
      const { min, max } = cond.range
      const unit = property.unit ? ` ${property.unit}` : ''
      if (min == null && max == null) return `${property.label} (no value)`
      if (min != null && max != null) return `${property.label} is between ${min} and ${max}${unit}`
      if (min != null) return `${property.label} is at least ${min}${unit}`
      return `${property.label} is at most ${max}${unit}`
    }
    case 'minimum': {
      if (cond.minimum == null) return `${property.label} (no value)`
      return `${property.label} is at least ${cond.minimum}`
    }
  }
}

const OP_PHRASE: Record<Condition['op'], string> = {
  any: 'is any of',
  all: 'is all of',
  none: 'is none of',
}
