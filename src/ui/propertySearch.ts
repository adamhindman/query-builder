import { el } from '../dom'
import { PROPERTIES } from '../data/properties'
import type { Property, PropertyValue } from '../data/schema'

/**
 * Shared "search properties or values" logic, used by both the left sidebar
 * (`ui/sidebar.ts`) and the in-condition property picker
 * (`ui/render.ts`'s property dropdown) — same matching rules, same
 * highlighting, so a value hit looks and behaves the same wherever it's
 * found.
 */

export type FacetView = {
  property: Property
  /** Values whose labels match the search — shown as clickable pills. */
  valueHits: PropertyValue[]
}

/**
 * Filter by property label OR value label. A value match keeps the property
 * visible and carries the matching values along as pills.
 */
export function filterProperties(q: string): FacetView[] {
  return PROPERTIES.flatMap((property): FacetView[] => {
    if (!q) return [{ property, valueHits: [] }]
    const valueHits =
      property.kind === 'enum'
        ? property.values.filter((v) => v.label.toLowerCase().includes(q))
        : []
    const nameHit = property.label.toLowerCase().includes(q)
    return nameHit || valueHits.length > 0 ? [{ property, valueHits }] : []
  })
}

/** The label with every occurrence of the search text wrapped in <mark>. */
export function highlight(label: string, q: string): (string | HTMLElement)[] {
  if (!q) return [label]
  const lower = label.toLowerCase()
  const parts: (string | HTMLElement)[] = []
  let i = 0
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, i)) {
    if (at > i) parts.push(label.slice(i, at))
    parts.push(el('mark', {}, label.slice(at, at + q.length)))
    i = at + q.length
  }
  if (i < label.length) parts.push(label.slice(i))
  return parts
}
