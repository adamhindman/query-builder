import { el, clear } from '../dom'
import { PROPERTIES } from '../data/properties'
import type { Property, PropertyValue } from '../data/schema'
import type { Condition } from '../query/model'
import {
  addChild,
  countConditions,
  defaultOpFor,
  newCondition,
  removePropertyConditions,
  usedPropertyIds,
} from '../query/model'
import type { QueryStore } from '../query/store'
import { startPropertyDrag, endPropertyDrag } from './dnd'

/**
 * Left sidebar: every property as a selectable row in one flat, filterable
 * list (real data has no property categories) — the properties splayed out
 * rather than hidden in the builder's dropdown. Clicking a row appends a
 * condition for that property (with no value chosen yet) to the end of the
 * root group; the value is then picked in the builder, and the condition
 * dragged into a nested group when needed. Rows can also be dragged straight
 * onto a drop zone in the tree.
 *
 * Values are not listed — with one exception: when the search text matches a
 * value's label, that value shows as a clickable pill under its property
 * (matched substring highlighted), and clicking it adds a ready-made
 * condition with that value already selected.
 *
 * The sidebar is persistent chrome: it never re-renders on store changes —
 * only its list region re-renders as the filter text changes (so the search
 * input never loses focus). Its one reaction to query state is a class
 * toggle: properties used by any condition in the tree get an "in use"
 * highlight, kept current via a store subscription.
 */

type FacetView = {
  property: Property
  /** Values whose labels match the search — shown as clickable pills. */
  valueHits: PropertyValue[]
}

/**
 * Filter by property label OR value label. A value match keeps the property
 * visible and carries the matching values along as pills.
 */
function filterProperties(q: string): FacetView[] {
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
function highlight(label: string, q: string): (string | HTMLElement)[] {
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

export function renderSidebar(store: QueryStore): HTMLElement {
  // Append to the end of the topmost (root) group; the root's id is the
  // tree's own id.
  const addToRoot = (partial: Partial<Condition>) =>
    store.update((s) => addChild(s, s.id, { ...newCondition(), ...partial }))

  // Remove every condition on the property, wherever it sits; if that empties
  // the tree, leave one blank condition (the same "never empty" rule as
  // startup and Clear all).
  const removeFromQuery = (propertyId: string) =>
    store.update((s) => {
      const next = removePropertyConditions(s, propertyId)
      return countConditions(next) === 0 ? { ...next, children: [...next.children, newCondition()] } : next
    })

  const list = el('div', { class: 'sidebar-list' })

  const renderList = (query: string): void => {
    clear(list)
    const q = query.trim().toLowerCase()
    const facets = filterProperties(q)
    if (facets.length === 0) {
      list.appendChild(el('p', { class: 'sidebar-empty' }, `No matches for “${query.trim()}”.`))
      return
    }
    for (const { property, valueHits } of facets) {
      // Always-visible when in use: a checkmark at the row's right edge.
      const check = el('span', { class: 'facet-check', 'aria-hidden': 'true' })
      check.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'

      list.appendChild(
        el(
          'div',
          { class: 'facet' },
          el(
            'button',
            {
              type: 'button',
              class: 'facet-row',
              dataset: { propertyId: property.id },
              // One handler, two actions: the hover affordance removes when
              // the property is in use ("−"); everywhere else adds ("+" or
              // the row body).
              onclick: (e: Event) => {
                const inUse = usedPropertyIds(store.get()).has(property.id)
                const onAffordance = !!(e.target as Element).closest?.('.facet-add')
                if (inUse && onAffordance) removeFromQuery(property.id)
                else addToRoot({ propertyId: property.id, op: defaultOpFor(property.kind) })
              },
              // Rows can also be dragged straight onto a drop zone in the
              // tree, placing the new condition in one gesture.
              draggable: true,
              ondragstart: (e: Event) => {
                const de = e as DragEvent
                startPropertyDrag(property.id)
                de.dataTransfer?.setData('text/plain', property.label)
                if (de.dataTransfer) de.dataTransfer.effectAllowed = 'copy'
                ;(de.currentTarget as HTMLElement).classList.add('dragging')
              },
              ondragend: (e: Event) => {
                endPropertyDrag()
                ;(e.currentTarget as HTMLElement).classList.remove('dragging')
              },
            },
            el('span', { class: 'facet-label' }, highlight(property.label, q)),
            check,
            // Hover affordance — "+" to add, or "−" to remove when the
            // property is in use (glyph/tooltip swapped by applyUsage). The
            // custom tooltip (shared data-tip CSS) replaces a native title.
            el(
              'span',
              {
                class: 'facet-add',
                'data-tip': `Add a condition on ${property.label}`,
                'aria-hidden': 'true',
              },
              '+',
            ),
          ),
          valueHits.length > 0 &&
            el(
              'div',
              { class: 'facet-hits' },
              ...valueHits.map((v) =>
                el(
                  'button',
                  {
                    type: 'button',
                    class: 'facet-hit',
                    title: `Add: ${property.label} is any of ${v.label}`,
                    onclick: () =>
                      addToRoot({ propertyId: property.id, op: 'any', valueIds: [v.id] }),
                  },
                  highlight(v.label, q),
                ),
              ),
            ),
        ),
      )
    }
  }

  // Mark the rows of properties used by any condition in the current tree.
  // A class toggle over the existing rows, not a re-render — and re-applied
  // after each renderList, since filtering rebuilds the rows.
  const applyUsage = (): void => {
    const used = usedPropertyIds(store.get())
    list.querySelectorAll<HTMLElement>('[data-property-id]').forEach((row) => {
      const inUse = used.has(row.dataset.propertyId!)
      row.classList.toggle('in-use', inUse)
      // The label explains the highlight on hover (shared data-tip tooltip
      // pattern; the row's affordance keeps its own tooltip).
      const label = row.querySelector<HTMLElement>('.facet-label')
      if (inUse) label?.setAttribute('data-tip', 'Used in the current query')
      else label?.removeAttribute('data-tip')
      // The hover affordance flips between add and remove.
      const affordance = row.querySelector<HTMLElement>('.facet-add')
      if (affordance) {
        affordance.textContent = inUse ? '−' : '+'
        affordance.setAttribute(
          'data-tip',
          inUse ? 'Remove from the query' : `Add a condition on ${label?.textContent ?? ''}`,
        )
      }
    })
  }
  store.subscribe(applyUsage)

  renderList('')
  applyUsage()

const searchGlyph = el('span', { class: 'search-icon', 'aria-hidden': 'true' })
  searchGlyph.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>'

  const input = el('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'Search properties or values…',
    'aria-label': 'Search properties or values',
    oninput: () => {
      renderList(input.value)
      applyUsage()
      syncClear()
    },
  }) as HTMLInputElement
  // Clear icon inside the input's right edge, shown only while there's text —
  // same treatment as the builder's property-dropdown filter.
  const clearBtn = el(
    'button',
    {
      type: 'button',
      class: 'filter-clear',
      title: 'Clear search',
      'aria-label': 'Clear search',
      onclick: () => {
        input.value = ''
        renderList('')
        applyUsage()
        syncClear()
        input.focus()
      },
    },
    '✕',
  )
  const syncClear = () => {
    clearBtn.hidden = input.value === ''
  }
  syncClear()

  return el(
    'aside',
    { class: 'sidebar' },
    el(
      'div',
      { class: 'sidebar-top' },
      el('div', { class: 'search-wrap' }, searchGlyph, input, clearBtn),
      el('p', { class: 'sidebar-hint' }, 'Click a property below to add it to the query builder.'),
    ),
    el('h3', { class: 'sidebar-list-heading' }, 'Select a property to add'),
    list,
  )
}
