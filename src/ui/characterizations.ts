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
 * Each chart can optionally be **cross-tabulated** with a second variable,
 * turning it into a grouped bar chart (one color per option of the second
 * variable). Sits between the query builder and the results table.
 *
 * Privacy is the whole point: **no chart ever shows an exact count** —
 * there's no per-bar label at all, only the X axis's own scale. Every bar's
 * length goes through the same rounding rules as the main match-count badge
 * (`query/rounding.ts`) — 0 stays 0, a nonzero count under the suppression
 * threshold clamps to the threshold, everything else rounds to the nearest
 * 10. Because the plotted numbers are already rounded, Plotly's own axis
 * ticks never land on an exact value either. Cross-tabbed cells go through
 * the exact same per-cell rounding — a cross-tab just means more, smaller
 * cells, more of which will individually clamp to the suppression floor.
 *
 * Only enum and boolean properties have discrete "options" a bar can
 * represent — range/text properties are left out of both pickers.
 *
 * Grouped (not stacked) bars, deliberately: every bar in a stacked chart
 * except the bottom one sits on a non-zero baseline, which makes comparing
 * segment lengths across bars unreliable (Cleveland & McGill's graphical
 * perception research). Grouped bars keep every bar on the same zero
 * baseline.
 */

function isCharacterizable(p: Property): boolean {
  return p.kind === 'enum' || p.kind === 'boolean'
}

const CHARACTERIZABLE_PROPERTIES = PROPERTIES.filter(isCharacterizable)

// A small qualitative palette for a cross-tab's secondary variable, cycled
// if it has more options than colors. The brand teal (single-variable
// charts' only color) leads it, so a 2-option secondary variable's first
// series still reads as "the same teal as every other chart."
const CROSSTAB_PALETTE = ['#39ac97', '#497097', '#bf5a17', '#8a63d2', '#d6556b', '#4a9d5f']

// Plotly (even the "basic" trace bundle) is well over 1MB — dynamically
// imported so it's only fetched once a chart is actually needed (the
// section starts empty by default), not added to the initial page load.
// Cached after the first import so later charts don't re-fetch it.
let plotlyPromise: Promise<typeof import('plotly.js-basic-dist-min')> | null = null
function loadPlotly(): Promise<typeof import('plotly.js-basic-dist-min')> {
  plotlyPromise ??= import('plotly.js-basic-dist-min')
  return plotlyPromise
}

type Option = { id: string; label: string }

/** A characterizable property's discrete options — Yes/No for booleans. */
function optionsFor(property: Property): Option[] {
  if (property.kind === 'boolean') return [{ id: 'true', label: 'Yes' }, { id: 'false', label: 'No' }]
  if (property.kind === 'enum') return property.values
  return []
}

/** Whether `record` has `optionId` selected for `property` (any characterizable kind). */
function recordHasOption(record: ParticipantRecord, property: Property, optionId: string): boolean {
  const v = record.values[property.id]
  if (property.kind === 'boolean') return optionId === 'true' ? v === true : v === false
  if (property.kind === 'enum') return Array.isArray(v) && v.includes(optionId)
  return false
}

/** One option's rounded count for a given property, computed over `matches`. */
function countsForProperty(matches: ParticipantRecord[], property: Property): { label: string; count: number }[] {
  return optionsFor(property).map((opt) => ({
    label: opt.label,
    count: matches.reduce((n, r) => n + (recordHasOption(r, property, opt.id) ? 1 : 0), 0),
  }))
}

/**
 * Cross-tab counts: one row per `primary` option, each holding a count per
 * `secondary` option (same order as `optionsFor(secondary)`, so callers can
 * index the two in lockstep rather than matching on label). A single pass
 * over `matches`, not one pass per option pair.
 */
function crossTabCounts(
  matches: ParticipantRecord[],
  primary: Property,
  secondary: Property,
): { label: string; series: number[] }[] {
  const primaryOptions = optionsFor(primary)
  const secondaryOptions = optionsFor(secondary)
  const counts = primaryOptions.map(() => secondaryOptions.map(() => 0))

  for (const r of matches) {
    primaryOptions.forEach((po, i) => {
      if (!recordHasOption(r, primary, po.id)) return
      secondaryOptions.forEach((so, j) => {
        if (recordHasOption(r, secondary, so.id)) counts[i][j]++
      })
    })
  }

  return primaryOptions.map((po, i) => ({ label: po.label, series: counts[i] }))
}

/** Build (or rebuild) one property's chart — optionally cross-tabbed with `secondary` — into `plotEl`. */
async function drawChart(
  plotEl: HTMLElement,
  property: Property,
  secondary: Property | undefined,
  matches: ParticipantRecord[],
): Promise<void> {
  const { default: Plotly } = await loadPlotly()
  // The store (or the selected-variables list) may have changed again while
  // Plotly's first import was still in flight — if this card was already
  // discarded by a subsequent renderAll(), don't bother drawing into it.
  if (!plotEl.isConnected) return

  const sharedLayout: Partial<Plotly.Layout> = {
    font: { family: 'DM Sans, system-ui, sans-serif', size: 12, color: '#33373d' },
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
  }

  if (!secondary) {
    const rows = countsForProperty(matches, property)
    // Plotly draws bottom-to-top, so reverse the list to read top-to-bottom
    // the same order the property defines its options in.
    const ordered = [...rows].reverse()
    Plotly.newPlot(
      plotEl,
      [
        {
          type: 'bar',
          orientation: 'h',
          y: ordered.map((r) => r.label),
          x: ordered.map((r) => approximateCountValue(r.count)),
          // `cornerradius` (rounded bar ends) is missing from
          // @types/plotly.js, though plotly.js itself has supported it
          // since v2.28.
          marker: { color: '#39ac97', cornerradius: 4 } as unknown as Plotly.PlotMarker,
          hoverinfo: 'skip',
        },
      ],
      {
        ...sharedLayout,
        title: {
          text: `<b>${property.label}</b>`,
          x: 0,
          xanchor: 'left',
          font: { family: 'DM Sans, system-ui, sans-serif', size: 15 },
        },
        margin: { l: 140, r: 40, t: 40, b: 46 },
        // A fixed px-per-option allocation (no floor/cap) — Plotly sizes
        // each bar's thickness relative to the chart's own height divided
        // by its option count, so a floor here (e.g. for a 2-option
        // boolean chart) would make its bars visibly thicker than a chart
        // with more options. Keeping this strictly linear is what keeps
        // bar thickness consistent across charts regardless of how many
        // options each one has.
        height: ordered.length * 24 + 90,
        showlegend: false,
      },
      { displayModeBar: false, responsive: true },
    )
    return
  }

  const rows = [...crossTabCounts(matches, property, secondary)].reverse()
  const secondaryOptions = optionsFor(secondary)
  const traces = secondaryOptions.map((so, j) => ({
    type: 'bar' as const,
    orientation: 'h' as const,
    name: so.label,
    y: rows.map((r) => r.label),
    x: rows.map((r) => approximateCountValue(r.series[j])),
    marker: { color: CROSSTAB_PALETTE[j % CROSSTAB_PALETTE.length], cornerradius: 4 } as unknown as Plotly.PlotMarker,
    hoverinfo: 'skip' as const,
  }))
  Plotly.newPlot(plotEl, traces, {
    ...sharedLayout,
    title: {
      text: `<b>${property.label} × ${secondary.label}</b>`,
      x: 0,
      xanchor: 'left',
      font: { family: 'DM Sans, system-ui, sans-serif', size: 15 },
    },
    margin: { l: 140, r: 40, t: 40, b: 46 },
    // Same linear, no-floor reasoning as the single-variable chart — but
    // now each primary option's row has to fit one bar per secondary
    // option, so the per-option allocation scales by how many there are,
    // keeping every individual bar (not just every row) a consistent 24px.
    height: rows.length * secondaryOptions.length * 24 + 110,
    barmode: 'group',
    showlegend: true,
    legend: { orientation: 'h', x: 0, y: 1.08 },
  } as Plotly.Layout, { displayModeBar: false, responsive: true })
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

/** Per-card `<select>` picking (or clearing) the second, cross-tab variable.
    Excludes the card's own primary property; everything else characterizable
    is fair game, including a property already charted elsewhere on its own. */
function crossTabPicker(primaryId: string, current: string | null, onPick: (id: string | null) => void): HTMLElement {
  const select = el('select', {
    class: 'char-picker-select char-crosstab-select',
    'aria-label': 'Cross-tabulate with another variable',
    onchange: () => onPick(select.value || null),
  }) as HTMLSelectElement
  select.replaceChildren(
    el('option', { value: '' }, 'Select a second variable'),
    ...CHARACTERIZABLE_PROPERTIES.filter((p) => p.id !== primaryId).map((p) =>
      el('option', { value: p.id, selected: p.id === current }, `× ${p.label}`),
    ),
  )
  return select
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

type Chart = { propertyId: string; crossTabId: string | null }

export function renderCharacterizations(store: QueryStore): HTMLElement {
  const charts: Chart[] = []
  const chartsWrap = el('div', { class: 'char-charts' })
  const emptyNote = el(
    'p',
    { class: 'char-empty' },
    'No characterizations added yet — pick a variable below to see its distribution for the current query.',
  )

  const why = whyLink()

  const picker = variablePicker((propertyId) => {
    charts.push({ propertyId, crossTabId: null })
    renderAll()
  })

  function removeVariable(propertyId: string): void {
    const i = charts.findIndex((c) => c.propertyId === propertyId)
    if (i !== -1) charts.splice(i, 1)
    renderAll()
  }

  function setCrossTab(propertyId: string, crossTabId: string | null): void {
    const chart = charts.find((c) => c.propertyId === propertyId)
    if (chart) chart.crossTabId = crossTabId
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
    if (autoAdded || charts.length > 0) return
    for (const propertyId of usedPropertyIds(store.get())) {
      const property = getProperty(propertyId)
      if (property && isCharacterizable(property)) {
        autoAdded = true
        charts.push({ propertyId, crossTabId: null })
        return
      }
    }
  }

  function renderAll(): void {
    maybeAutoAdd()
    emptyNote.hidden = charts.length > 0
    const matches = filterRecords(RECORDS, store.get())
    clear(chartsWrap)
    for (const chart of charts) {
      const property = getProperty(chart.propertyId)
      if (!property) continue
      const secondary = chart.crossTabId ? getProperty(chart.crossTabId) : undefined
      const plotEl = el('div', { class: 'char-plot' })
      chartsWrap.appendChild(
        el(
          'div',
          { class: 'char-card' },
          el(
            'div',
            { class: 'char-card-head' },
            crossTabPicker(chart.propertyId, chart.crossTabId, (id) => setCrossTab(chart.propertyId, id)),
            el(
              'button',
              {
                type: 'button',
                class: 'char-remove',
                title: `Remove ${property.label} characterization`,
                'aria-label': `Remove ${property.label} characterization`,
                onclick: () => removeVariable(chart.propertyId),
              },
              '✕',
            ),
          ),
          plotEl,
        ),
      )
      drawChart(plotEl, property, secondary, matches)
    }
    picker.refresh((id) => charts.some((c) => c.propertyId === id))
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
