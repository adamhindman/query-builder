import { el } from '../dom'
import { getProperty } from '../data/properties'

/**
 * Mockup of the ELITE Portal's default faceted-filter sidebar
 * (https://eliteportal.synapse.org/Explore/Cohort%20Builder/Individuals) —
 * a visual placeholder only, with no wiring to the query builder or the
 * results table. It exists purely so the prototype can show the "browse"
 * landing view before the user switches into Query Builder mode.
 *
 * The facet values are our own schema properties, standing in for the
 * portal's own fields. A handful render as full expanded sections (matching
 * the reference's Age/Sex/Study/Family Study Participant treatment); the
 * rest appear only as inactive chips in "Available Filters".
 */

/** Shown as expanded sections by default, in this order. */
const DEFAULT_FACET_IDS = ['age', 'sex', 'diagnosis']

/** Extra properties listed only as inactive chips, to round out the mockup. */
const CHIP_ONLY_IDS = [
  'cohort',
  'familyStudyParticipant',
  'race',
  'ethnicGroupCode',
  'dataType',
  'assayType',
  'fileFormat',
  'hasMZTwinData',
  'mortalityStatus',
]

/** A small, stable-looking fake count — decoration only, not derived from data. */
function fakeCount(seed: number): string {
  const n = ((seed * 2654435761) >>> 0) % 4800
  return (n + 3).toLocaleString()
}

function checkbox(checked: boolean): HTMLElement {
  const box = el('span', { class: `facet-mock-checkbox${checked ? ' checked' : ''}`, 'aria-hidden': 'true' })
  if (checked) {
    box.innerHTML =
      '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
  }
  return box
}

function searchGlyph(): HTMLElement {
  const span = el('span', { class: 'facet-mock-search', 'aria-hidden': 'true' })
  span.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>'
  return span
}

function minusGlyph(): HTMLElement {
  const span = el('span', { class: 'facet-mock-toggle', 'aria-hidden': 'true' })
  span.innerHTML =
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 12h16"/></svg>'
  return span
}

/** Value rows past this count start collapsed behind "Show all (N)". */
const VISIBLE_VALUE_COUNT = 5

/** One expanded facet section: header, an "All" row, then a row per value —
    only the first few values show by default, matching the reference's
    "Show all (N)" collapse for long value lists. */
function facetSection(propertyId: string, seed: number): HTMLElement | null {
  const property = getProperty(propertyId)
  if (!property) return null

  const rows: HTMLElement[] =
    property.kind === 'enum'
      ? property.values.map((v, i) =>
          el(
            'div',
            { class: 'facet-mock-row' },
            checkbox(false),
            el('span', { class: 'facet-mock-label' }, v.label),
            el('span', { class: 'facet-mock-count' }, fakeCount(seed * 97 + i)),
          ),
        )
      : property.kind === 'boolean'
        ? ['No', 'Yes'].map((label, i) =>
            el(
              'div',
              { class: 'facet-mock-row' },
              checkbox(false),
              el('span', { class: 'facet-mock-label' }, label),
              el('span', { class: 'facet-mock-count' }, fakeCount(seed * 53 + i)),
            ),
          )
        : []

  const visibleRows = rows.slice(0, VISIBLE_VALUE_COUNT)
  const hiddenRows = rows.slice(VISIBLE_VALUE_COUNT)

  let showAllBtn: HTMLElement | null = null
  if (hiddenRows.length > 0) {
    const hiddenWrap = el('div', { class: 'facet-mock-hidden-rows', hidden: true }, ...hiddenRows)
    let expanded = false
    showAllBtn = el(
      'button',
      {
        type: 'button',
        class: 'facet-mock-show-all',
        onclick: () => {
          expanded = !expanded
          hiddenWrap.hidden = !expanded
          showAllBtn!.textContent = expanded ? 'Show less' : `Show all (${rows.length})`
        },
      },
      `Show all (${rows.length})`,
    )
    visibleRows.push(hiddenWrap)
  }

  return el(
    'section',
    { class: 'facet-mock-section' },
    el(
      'div',
      { class: 'facet-mock-section-head' },
      el('span', { class: 'facet-mock-title' }, property.label),
      minusGlyph(),
    ),
    el(
      'div',
      { class: 'facet-mock-row facet-mock-all' },
      checkbox(true),
      el('span', { class: 'facet-mock-label' }, 'All'),
      searchGlyph(),
    ),
    ...visibleRows,
    showAllBtn,
  )
}

/** The "Available Filters" chip row: active chips for the default facets,
    plain "+" chips for everything else. */
function availableFiltersRow(): HTMLElement {
  const chips = [
    ...DEFAULT_FACET_IDS.map((id) => ({ id, active: true })),
    ...CHIP_ONLY_IDS.map((id) => ({ id, active: false })),
  ]
  return el(
    'div',
    { class: 'facet-mock-available' },
    el('h3', { class: 'facet-mock-available-title' }, 'Available Filters'),
    el(
      'div',
      { class: 'facet-mock-chips' },
      ...chips.map(({ id, active }) => {
        const property = getProperty(id)
        if (!property) return null
        return el(
          'span',
          { class: `facet-mock-chip${active ? ' active' : ''}` },
          property.label,
          el('span', { class: 'facet-mock-chip-suffix' }, active ? '✓' : '+'),
        )
      }),
    ),
  )
}

/** Build the whole non-functional faceted-filter sidebar mockup. */
export function renderFacetSidebar(): HTMLElement {
  return el(
    'aside',
    { class: 'sidebar facet-mock-sidebar' },
    availableFiltersRow(),
    ...DEFAULT_FACET_IDS.map((id, i) => facetSection(id, i + 1)).filter((n): n is HTMLElement => !!n),
  )
}
