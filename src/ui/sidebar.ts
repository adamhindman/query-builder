import { el, clear } from '../dom'
import { PROPERTIES } from '../data/properties'
import type { Property, PropertyValue } from '../data/schema'
import type { Condition } from '../query/model'
import { addChild, defaultOpFor, newCondition, usedPropertyIds } from '../query/model'
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
              onclick: () =>
                addToRoot({ propertyId: property.id, op: defaultOpFor(property.kind) }),
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
            // Hover affordance only — the whole row is the button; the
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
      // pattern; the row's "+" keeps its own add tooltip).
      const label = row.querySelector<HTMLElement>('.facet-label')
      if (inUse) label?.setAttribute('data-tip', 'Used in the current query')
      else label?.removeAttribute('data-tip')
    })
  }
  store.subscribe(applyUsage)

  renderList('')
  applyUsage()

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
      el('div', { class: 'search-wrap' }, input, clearBtn),
      el(
        'p',
        { class: 'sidebar-hint' },
        'Search property names or values. Click a property to start a condition, then refine it in the builder.',
      ),
    ),
    list,
  )
}
