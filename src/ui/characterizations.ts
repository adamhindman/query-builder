import { el, clear } from '../dom'
import { PROPERTIES, getProperty } from '../data/properties'
import type { Property } from '../data/schema'
import { RECORDS, type ParticipantRecord } from '../data/records'
import { filterRecords } from '../query/evaluate'
import { usedPropertyIds } from '../query/model'
import type { QueryStore } from '../query/store'
import { approximateCountValue } from '../query/rounding'
import type * as Plotly from 'plotly.js'

/**
 * "Characterizations": bar charts showing the current query's cohort broken
 * down by a variable the user picks — one bar per option of that variable.
 * Sits between the query builder and the results table.
 *
 * Privacy is the whole point: **no chart ever shows an exact count** —
 * there's no per-bar label at all, only the X axis's own scale. Every bar's
 * length goes through the same rounding rules as the main match-count badge
 * (`query/rounding.ts`) — 0 stays 0, a nonzero count under the suppression
 * threshold clamps to the threshold, everything else rounds to the nearest
 * 10. Because the plotted numbers are already rounded, Plotly's own axis
 * ticks never land on an exact value either.
 *
 * Only enum and boolean properties have discrete "options" a bar can
 * represent — range/text properties are left out of the picker.
 */

function isCharacterizable(p: Property): boolean {
  return p.kind === 'enum' || p.kind === 'boolean'
}

const CHARACTERIZABLE_PROPERTIES = PROPERTIES.filter(isCharacterizable)

// Plotly (even the "basic" trace bundle) is well over 1MB — dynamically
// imported so it's only fetched once a chart is actually needed (the
// section starts empty by default), not added to the initial page load.
// Cached after the first import so later charts don't re-fetch it.
let plotlyPromise: Promise<typeof import('plotly.js-basic-dist-min')> | null = null
function loadPlotly(): Promise<typeof import('plotly.js-basic-dist-min')> {
  plotlyPromise ??= import('plotly.js-basic-dist-min')
  return plotlyPromise
}

/** One option's rounded count for a given property, computed over `matches`. */
function countsForProperty(
  matches: ParticipantRecord[],
  property: Property,
): { label: string; count: number }[] {
  if (property.kind === 'boolean') {
    let yes = 0
    let no = 0
    for (const r of matches) {
      const v = r.values[property.id]
      if (v === true) yes++
      else if (v === false) no++
    }
    return [
      { label: 'Yes', count: yes },
      { label: 'No', count: no },
    ]
  }
  if (property.kind === 'enum') {
    const counts = new Map(property.values.map((v) => [v.id, 0]))
    for (const r of matches) {
      const v = r.values[property.id]
      if (Array.isArray(v)) {
        for (const id of v) {
          if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1)
        }
      }
    }
    return property.values.map((v) => ({ label: v.label, count: counts.get(v.id) ?? 0 }))
  }
  return []
}

/** Build (or rebuild) one property's chart into `plotEl`. */
async function drawChart(plotEl: HTMLElement, property: Property, matches: ParticipantRecord[]): Promise<void> {
  const rows = countsForProperty(matches, property)
  // Plotly draws bottom-to-top, so reverse the list to read top-to-bottom
  // the same order the property defines its options in.
  const ordered = [...rows].reverse()
  const values = ordered.map((r) => approximateCountValue(r.count))

  const { default: Plotly } = await loadPlotly()
  // The store (or the selected-variables list) may have changed again while
  // Plotly's first import was still in flight — if this card was already
  // discarded by a subsequent renderAll(), don't bother drawing into it.
  if (!plotEl.isConnected) return
  Plotly.newPlot(
    plotEl,
    [
      {
        type: 'bar',
        orientation: 'h',
        y: ordered.map((r) => r.label),
        x: values,
        // `cornerradius` (rounded bar ends) is missing from @types/plotly.js,
        // though plotly.js itself has supported it since v2.28.
        marker: { color: '#39ac97', cornerradius: 4 } as unknown as Plotly.PlotMarker,
        hoverinfo: 'skip',
      },
    ],
    {
      title: {
        text: `<b>${property.label}</b>`,
        x: 0,
        xanchor: 'left',
        font: { family: 'DM Sans, system-ui, sans-serif', size: 15 },
      },
      font: { family: 'DM Sans, system-ui, sans-serif', size: 12, color: '#33373d' },
      margin: { l: 140, r: 40, t: 40, b: 46 },
      // A fixed px-per-option allocation (no floor/cap) — Plotly sizes each
      // bar's thickness relative to the chart's own height divided by its
      // option count, so a floor here (e.g. for a 2-option boolean chart)
      // would make its bars visibly thicker than a chart with more options.
      // Keeping this strictly linear is what keeps bar thickness consistent
      // across charts regardless of how many options each one has.
      height: ordered.length * 24 + 90,
      xaxis: {
        title: { text: 'Approximate count', standoff: 16 },
        rangemode: 'tozero',
        showline: false,
        zeroline: false,
      },
      // `ticklabelstandoff` (space between tick labels and the axis) is
      // missing from @types/plotly.js, though plotly.js itself has
      // supported it since v2.26.
      yaxis: { automargin: true, showline: false, ticklabelstandoff: 10 } as unknown as Plotly.LayoutAxis,
      showlegend: false,
    },
    { displayModeBar: false, responsive: true },
  )
}

/** A plain `<select>` of characterizable properties not already added.
    `refresh` rebuilds the option list (called after every add/remove, since
    an added property should disappear from the choices). */
function variablePicker(onPick: (propertyId: string) => void): {
  el: HTMLSelectElement
  refresh: (isAdded: (id: string) => boolean) => void
} {
  const select = el('select', {
    class: 'char-picker-select',
    'aria-label': 'Add a characterization variable',
    onchange: () => {
      const id = select.value
      if (id) {
        onPick(id)
        select.value = ''
      }
    },
  }) as HTMLSelectElement

  function refresh(isAdded: (id: string) => boolean): void {
    select.replaceChildren(
      el('option', { value: '', disabled: true, selected: true }, 'Add a characterization…'),
      ...CHARACTERIZABLE_PROPERTIES.filter((p) => !isAdded(p.id)).map((p) => el('option', { value: p.id }, p.label)),
    )
  }

  return { el: select, refresh }
}

/** Explains the rounding — a small link that reveals a click-toggled
    tooltip (not hover: the explanation is a full sentence, easy to lose
    by moving the mouse off it). Closes when its own button is clicked
    again, or when anything outside it is clicked. */
function whyLink(): HTMLElement {
  const tooltip = el(
    'div',
    { class: 'char-why-tooltip', hidden: true, role: 'tooltip' },
    'All counts have been rounded to reduce the risk of subject ' +
      're-identification; characterization charts depict proportional ' +
      'relationships only.',
  )
  const btn = el(
    'button',
    {
      type: 'button',
      class: 'char-why',
      'aria-expanded': 'false',
      onclick: (e: Event) => {
        e.stopPropagation()
        const opening = tooltip.hidden
        closeAllWhyTooltips()
        tooltip.hidden = !opening
        btn.setAttribute('aria-expanded', String(opening))
      },
    },
    "Why can't I see the counts?",
  )
  return el('span', { class: 'char-why-wrap' }, btn, tooltip)
}

function closeAllWhyTooltips(): void {
  document.querySelectorAll<HTMLElement>('.char-why-tooltip').forEach((t) => (t.hidden = true))
  document
    .querySelectorAll<HTMLElement>('.char-why[aria-expanded="true"]')
    .forEach((b) => b.setAttribute('aria-expanded', 'false'))
}

// Close any open tooltip when clicking anywhere outside it — the tooltip's
// own toggle button already stops propagation, so this only ever sees
// clicks that should close it.
document.addEventListener('click', closeAllWhyTooltips)

export function renderCharacterizations(store: QueryStore): HTMLElement {
  const selectedIds: string[] = []
  const chartsWrap = el('div', { class: 'char-charts' })
  const emptyNote = el(
    'p',
    { class: 'char-empty' },
    'No characterizations added yet — pick a variable below to see its distribution for the current query.',
  )

  const why = whyLink()

  const picker = variablePicker((propertyId) => {
    selectedIds.push(propertyId)
    renderAll()
  })

  function removeVariable(propertyId: string): void {
    const i = selectedIds.indexOf(propertyId)
    if (i !== -1) selectedIds.splice(i, 1)
    renderAll()
  }

  // One-time onboarding nudge: the moment the user picks a property for a
  // condition (typically the tree's first, blank-by-default one) and no
  // characterization has been added yet, show a chart for it automatically
  // — so the section demonstrates itself instead of staying empty until
  // the user finds the "+" dropdown. Only fires once, ever; removing every
  // chart afterward doesn't bring it back (that would fight the user).
  let autoAdded = false
  function maybeAutoAdd(): void {
    if (autoAdded || selectedIds.length > 0) return
    for (const propertyId of usedPropertyIds(store.get())) {
      const property = getProperty(propertyId)
      if (property && isCharacterizable(property)) {
        autoAdded = true
        selectedIds.push(propertyId)
        return
      }
    }
  }

  function renderAll(): void {
    maybeAutoAdd()
    emptyNote.hidden = selectedIds.length > 0
    const matches = filterRecords(RECORDS, store.get())
    clear(chartsWrap)
    for (const propertyId of selectedIds) {
      const property = getProperty(propertyId)
      if (!property) continue
      const plotEl = el('div', { class: 'char-plot' })
      chartsWrap.appendChild(
        el(
          'div',
          { class: 'char-card' },
          el(
            'div',
            { class: 'char-card-head' },
            el(
              'button',
              {
                type: 'button',
                class: 'char-remove',
                title: `Remove ${property.label} characterization`,
                'aria-label': `Remove ${property.label} characterization`,
                onclick: () => removeVariable(propertyId),
              },
              '✕',
            ),
          ),
          plotEl,
        ),
      )
      drawChart(plotEl, property, matches)
    }
    picker.refresh((id) => selectedIds.includes(id))
  }

  store.subscribe(renderAll)
  renderAll()

  return el(
    'section',
    { class: 'characterizations' },
    el(
      'div',
      { class: 'char-head' },
      el('h3', {}, 'Characterizations'),
      el('div', { class: 'char-head-controls' }, why, picker.el),
    ),
    emptyNote,
    chartsWrap,
  )
}
