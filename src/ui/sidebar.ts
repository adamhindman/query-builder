import { el, clear } from '../dom'
import { PROPERTY_GROUPS } from '../data/properties'
import type { Property, PropertyValue } from '../data/schema'
import type { Condition } from '../query/model'
import { addChild, newCondition } from '../query/model'
import type { QueryStore } from '../query/store'
import { startPropertyDrag, endPropertyDrag } from './dnd'

/**
 * Left sidebar: every property as a selectable row, grouped by category — the
 * properties splayed out rather than hidden in the builder's dropdown.
 * Clicking a row appends a condition for that property (with no value chosen
 * yet) to the end of the root group; the value is then picked in the builder,
 * and the condition dragged into a nested group when needed.
 *
 * Values are not listed — with one exception: when the search text matches a
 * value's label, that value shows as a clickable pill under its property
 * (matched substring highlighted), and clicking it adds a ready-made
 * condition with that value already selected.
 *
 * The sidebar is persistent chrome: it doesn't re-render on store changes,
 * only its list region re-renders as the filter text changes (so the search
 * input never loses focus).
 */

type FacetView = {
  property: Property
  /** Values whose labels match the search — shown as clickable pills. */
  valueHits: PropertyValue[]
}
type GroupView = { label: string; facets: FacetView[] }

/**
 * Filter by property label OR value label. A value match keeps the property
 * visible and carries the matching values along as pills. Empty categories
 * drop out entirely.
 */
function filterGroups(q: string): GroupView[] {
  return PROPERTY_GROUPS.map((group) => ({
    label: group.label,
    facets: group.properties.flatMap((property): FacetView[] => {
      if (!q) return [{ property, valueHits: [] }]
      const valueHits =
        property.kind === 'enum'
          ? property.values.filter((v) => v.label.toLowerCase().includes(q))
          : []
      const nameHit = property.label.toLowerCase().includes(q)
      return nameHit || valueHits.length > 0 ? [{ property, valueHits }] : []
    }),
  })).filter((group) => group.facets.length > 0)
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
    const groups = filterGroups(q)
    if (groups.length === 0) {
      list.appendChild(el('p', { class: 'sidebar-empty' }, `No matches for “${query.trim()}”.`))
      return
    }
    for (const group of groups) {
      list.appendChild(
        el(
          'section',
          { class: 'facet-group' },
          el('h3', {}, `${group.label} (${group.facets.length})`),
          ...group.facets.map(({ property, valueHits }) =>
            el(
              'div',
              { class: 'facet' },
              el(
                'button',
                {
                  type: 'button',
                  class: 'facet-row',
                  onclick: () => addToRoot({ propertyId: property.id }),
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
                // custom tooltip (CSS ::after) replaces a native title.
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
                          addToRoot({ propertyId: property.id, valueIds: [v.id] }),
                      },
                      highlight(v.label, q),
                    ),
                  ),
                ),
            ),
          ),
        ),
      )
    }
  }

  renderList('')

  const input = el('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'Search properties or values…',
    'aria-label': 'Search properties or values',
    oninput: () => {
      renderList(input.value)
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
