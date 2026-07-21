import './style.css'
import { el, clear } from './dom'
import { QueryStore } from './query/store'
import { defaultQuery, usedPropertyIds } from './query/model'
import { PRESETS, getPreset } from './query/presets'
import { renderTree, alignBrackets } from './ui/render'
import { renderSidebar } from './ui/sidebar'
import { renderFacetSidebar } from './ui/facetSidebar'
import { confirmModal, modalRoot, infoModal, infoModalRoot } from './ui/modal'
import { summarize } from './query/summary'
import { toSql } from './query/sql'
import { getProperty } from './data/properties'
import { RECORDS, type RecordValue } from './data/records'
import { filterRecords } from './query/evaluate'
import { SUPPRESSION_THRESHOLD, isBelowThreshold, approximateCount } from './query/rounding'
import { renderCharacterizations } from './ui/characterizations'
import { unmountAllDateFields } from './ui/dateField'

const app = document.querySelector<HTMLDivElement>('#app')!

const store = new QueryStore(defaultQuery())

// Persistent shell: header + tree mount + summary. Only the inner regions
// are re-rendered on state change.
const treeMount = el('div', { class: 'tree-mount' })
const summaryText = el('p', { class: 'summary-text' })

// The summary can read as plain English or as SQL — a pill switcher next to
// "Reads as" picks the view. Local UI state, not query state: it lives here
// in the persistent shell, untouched by tree re-renders.
let summaryMode: 'plain' | 'sql' = 'plain'

const makeViewBtn = (mode: typeof summaryMode, label: string): HTMLElement =>
  el(
    'button',
    {
      type: 'button',
      class: `seg${summaryMode === mode ? ' active' : ''}`,
      'aria-pressed': String(summaryMode === mode),
      onclick: () => setSummaryMode(mode),
    },
    label,
  )
const plainBtn = makeViewBtn('plain', 'Plain English')
const sqlBtn = makeViewBtn('sql', 'SQL')

function setSummaryMode(mode: typeof summaryMode): void {
  summaryMode = mode
  for (const [btn, m] of [
    [plainBtn, 'plain'],
    [sqlBtn, 'sql'],
  ] as const) {
    btn.classList.toggle('active', mode === m)
    btn.setAttribute('aria-pressed', String(mode === m))
  }
  renderSummary()
}

// Results: the query run against the mock participants table. The count and a
// small preview re-render on every store change.
const resultsCountNum = el('span', { class: 'results-count-num' })
const resultsCountLabel = el('span', { class: 'results-count-label' })
const resultsCountRow = el('span', { class: 'results-count-row' }, resultsCountNum, resultsCountLabel)
// Explains the rounding above, shown only alongside a rounded (i.e. not
// suppressed, not zero) count. Sits outside the tinted badge, to its left —
// a plain text link, same treatment as the Characterizations "Why can't I
// see the counts?" link.
const resultsCountDisclosure = el(
  'button',
  {
    type: 'button',
    class: 'results-count-disclosure',
    onclick: () =>
      infoModal(
        'How this number was computed',
        el(
          'div',
          {},
          // Placeholder copy — to be filled in with the real methodology later.
          el('p', {}, 'Result counts have been modified to protect privacy.'),
          el(
            'p',
            {},
            'Here is the methodology: Insert methodology here. Lorem ipsum dolor sit amet, ',
            'consectetuer adapiscing elit, sed do euismod tempore incidunt ut lore et dolore.',
          ),
        ),
      ),
  },
  'Results approximated.',
)
const resultsCount = el('div', { class: 'results-count' }, resultsCountRow)
const resultsCountWrap = el(
  'div',
  { class: 'results-count-wrap' },
  resultsCountDisclosure,
  resultsCount,
)
const resultsTable = el('div', { class: 'results-table-wrap' })

// Live count in the static Explore toolbar (markup lives in index.html).
const toolbarCount = document.querySelector<HTMLElement>('.toolbar-count')

// --- Batch row selection --------------------------------------------------
//
// Local UI state, not query state: which result rows (by id) are checked.
// Persists across pager clicks (so a selection can span pages of the same
// query) but is cleared whenever the query itself changes, since the
// underlying result set — and therefore which ids are even still valid —
// changes out from under it.
const selectedIds = new Set<string>()

const batchClearBtn = el(
  'button',
  { type: 'button', class: 'batch-toolbar-clear', onclick: () => clearSelection() },
  'Clear selection',
)
const batchCount = el('span', { class: 'batch-toolbar-count' })
const batchAddBtn = el(
  'button',
  {
    type: 'button',
    class: 'batch-toolbar-add-btn',
    // Adds the current selection to the (persisted) download list, but
    // deliberately does NOT clear the selection or uncheck rows — the rows
    // stay checked and the toolbar stays open, so adding is not the same
    // gesture as being done with the selection (that's what "Clear
    // selection" is for).
    onclick: () => addToDownloadList(selectedIds),
  },
  'Add to Download List',
)
const batchToolbar = el(
  'div',
  { class: 'batch-toolbar' },
  batchClearBtn,
  el('div', { class: 'batch-toolbar-right' }, batchCount, batchAddBtn),
)

function updateBatchToolbar(): void {
  const n = selectedIds.size
  batchToolbar.classList.toggle('visible', n > 0)
  batchCount.innerHTML = `<span class="batch-toolbar-count-num">${n.toLocaleString()}</span> selected`
}

function toggleRowSelected(id: string, checked: boolean): void {
  if (checked) selectedIds.add(id)
  else selectedIds.delete(id)
  updateBatchToolbar()
}

function clearSelection(): void {
  if (selectedIds.size === 0) return
  selectedIds.clear()
  updateBatchToolbar()
  // Re-render just the rows so their checkboxes visibly uncheck — cheaper
  // than a full store-driven re-render, and selection isn't query state.
  renderResults()
}

// The download list itself: which Syn IDs have been added, persisted to
// localStorage so it survives a reload. Tracking actual ids (not just a
// running count) means adding the same row twice — in the same session or
// across reloads — never double-counts it, since a Set stays deduplicated.
//
// Restoring on reload is deliberately partial: the *count* comes back (read
// once at startup, below), but which rows are checked does not — the batch
// toolbar only reappears once the user checks a row again this session.
const DOWNLOAD_LIST_STORAGE_KEY = 'query-builder:download-list'

function loadDownloadList(): Set<string> {
  try {
    const raw = localStorage.getItem(DOWNLOAD_LIST_STORAGE_KEY)
    const ids = raw ? JSON.parse(raw) : []
    return Array.isArray(ids) ? new Set(ids.filter((id): id is string => typeof id === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function saveDownloadList(ids: Set<string>): void {
  try {
    localStorage.setItem(DOWNLOAD_LIST_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // Storage unavailable/full — the in-memory list and badge still work
    // for the rest of this session, they just won't survive a reload.
  }
}

const downloadBadge = document.querySelector<HTMLElement>('.download-badge')
const downloadList = loadDownloadList()

function renderDownloadBadge(): void {
  if (!downloadBadge) return
  downloadBadge.textContent = downloadList.size > 99 ? '99+' : String(downloadList.size)
  downloadBadge.hidden = downloadList.size === 0
}
renderDownloadBadge()

function addToDownloadList(ids: Iterable<string>): void {
  for (const id of ids) downloadList.add(id)
  saveDownloadList(downloadList)
  renderDownloadBadge()
}

// Columns spanning the kinds/categories — id plus a representative property
// of each. Wider than fits most viewports on purpose; `.results-table-wrap`
// scrolls horizontally rather than letting columns get cramped.
const RESULT_COLUMNS = [
  'fileName',
  'dataType',
  'assayType',
  'fileFormat',
  'isMultiSpecimen',
  'isPartOfDataset',
  'fileSizeBytes',
  'studyCode',
  'countryCode',
  'cohort',
  'diagnosis',
  'sex',
  'age',
  'visitCode',
  'enrollmentDate',
  'hasBiomarkerData',
  'apoeGenotype',
]
const PAGE_SIZE = 25

// Decorative header icons (sort/help/filter) — mockup chrome like the nav;
// the table doesn't actually sort or filter yet.
const SORT_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h6"/></svg>'
const HELP_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.34c-.7.28-.9.66-.9 1.66"/><circle cx="12" cy="16.8" r="0.4" fill="currentColor"/></svg>'
const FILTER_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#39AC97" stroke-width="2" stroke-linejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>'

function headerIcon(svg: string): HTMLElement {
  const span = el('span', { class: 'th-icon', 'aria-hidden': 'true' })
  span.innerHTML = svg
  return span
}

function headerCell(label: string, ...extras: HTMLElement[]): HTMLElement {
  return el(
    'th',
    {},
    el(
      'div',
      { class: 'th-inner' },
      el('span', {}, label),
      el('span', { class: 'th-icons' }, ...extras, headerIcon(SORT_SVG)),
    ),
  )
}

// Current results page — local UI state (like the summary view mode), reset to
// the first page whenever the query changes.
let resultsPage = 0

/** Numeric kinds are right-aligned in the table, like the reference portal. */
function isNumericColumn(propertyId: string): boolean {
  return getProperty(propertyId)?.kind === 'range'
}

/** "3.8 GB" / "512 MB" / "820 bytes" — human-readable, like the reference. */
function formatBytes(bytes: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB']
  let n = bytes
  let unit = 0
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024
    unit++
  }
  return `${unit === 0 ? n : n.toFixed(1)} ${units[unit]}`
}

/** Format a record's value for a cell, using the property to label enum ids. */
function formatCell(propertyId: string, value: RecordValue): string {
  if (value == null || (Array.isArray(value) && value.length === 0)) return '—'
  const property = getProperty(propertyId)
  if (property?.kind === 'enum' && Array.isArray(value)) {
    return value.map((id) => property.values.find((v) => v.id === id)?.label ?? id).join(', ')
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (propertyId === 'fileSizeBytes' && typeof value === 'number') return formatBytes(value)
  return String(value)
}

const presetSelect = el(
  'select',
  {
    class: 'preset-select',
    'aria-label': 'Load an example query',
    onchange: (e: Event) => {
      const target = e.target as HTMLSelectElement
      const preset = getPreset(target.value)
      if (preset) store.update(() => preset.build())
    },
  },
  el('option', { value: '', disabled: true, selected: true }, 'Choose a sample query'),
  ...PRESETS.map((p) => el('option', { value: p.id }, p.label)),
)

const clearBtn = el(
  'button',
  {
    type: 'button',
    class: 'clear-btn',
    onclick: () => store.update(() => defaultQuery()),
  },
  'Clear all',
)

// The preset loader and Clear-all are dev/testing aids, kept off the main
// header. They live in a floating menu that's hidden by default; ⌘/Ctrl+\
// toggles it on and off.
const devMenu = el(
  'div',
  { class: 'dev-menu', hidden: true },
  el('span', { class: 'dev-menu-title' }, 'Dev tools'),
  presetSelect,
  clearBtn,
)
let devMenuOpen = false
function toggleDevMenu(): void {
  devMenuOpen = !devMenuOpen
  devMenu.hidden = !devMenuOpen
}
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
    e.preventDefault()
    toggleDevMenu()
  }
})

// The header/tree/summary make up the query builder proper; the results
// panel below is a separate feature and stays visible in both the default
// "browse" view and Query Builder mode.
const qbHelpBtn = el(
  'button',
  {
    type: 'button',
    class: 'qb-help-btn',
    'aria-label': 'How the query builder works',
    onclick: () =>
      infoModal(
        'How the query builder works',
        el(
          'ul',
          { class: 'modal-list' },
          el('li', {}, el('strong', {}, 'Groups'), ' combine their items with one AND or OR — mixed logic is expressed by nesting a group, not by mixing operators in one list.'),
          el('li', {}, 'Add ', el('strong', {}, 'NOT'), ' to a group to exclude everything inside it; for a single condition, use the "is none of" operator instead.'),
          el('li', {}, 'A ', el('strong', {}, 'condition'), ' filters one property — click its property, operator, or values to change them.'),
          el('li', {}, el('strong', {}, 'Drag'), ' rows to reorder them or move them into a different group; moving into a different group changes the logic.'),
          el('li', {}, 'The ', el('strong', {}, '"Reads as"'), ' sentence below the tree always shows the whole query in plain English.'),
        ),
      ),
  },
  '?',
)

const builderTop = el(
  'div',
  {},
  el(
    'header',
    { class: 'builder-header' },
    el('div', { class: 'builder-title-group' }, el('h1', {}, 'Cohort Builder'), qbHelpBtn),
    resultsCountWrap,
  ),
  el(
    'section',
    { class: 'summary' },
    el(
      'div',
      { class: 'summary-head' },
      el('h2', {}, 'Query Summary'),
      el(
        'div',
        { class: 'segmented view-toggle', role: 'group', 'aria-label': 'Summary format' },
        plainBtn,
        sqlBtn,
      ),
    ),
    summaryText,
  ),
  treeMount,
)

// The results panel (and characterizations, below) span the full remaining
// browser width (unconstrained by the builder's centered max-width), so
// they live outside `.builder` in its own flex column alongside it.
const builderMain = el('main', { class: 'builder' }, builderTop)
const characterizations = renderCharacterizations(store)

const shell = el(
  'div',
  { class: 'content-col' },
  builderMain,
  characterizations,
  el(
    'section',
    { class: 'results' },
    el('div', { class: 'results-head' }, el('h3', {}, 'Results')),
    resultsTable,
  ),
)

// Two mutually-exclusive sidebars: the ELITE-portal-style faceted-filter
// mockup (default "browse" view — a static placeholder, no wiring to the
// query builder or results) and the real query builder sidebar. The
// "Query Builder" toolbar button (static markup in index.html) swaps between
// them and reveals/hides the query builder proper; the results panel is
// unaffected either way.
const facetSidebar = renderFacetSidebar()
const querySidebar = renderSidebar(store)

type ViewMode = 'browse' | 'builder'
let mode: ViewMode = 'builder'

// Tracked so `applyMode` (which runs independently of a query change, e.g. on
// the browse/builder toolbar toggle) can factor the suppression state into
// characterizations' visibility too, not just the current view mode.
let lastBelowThreshold = false

const qbToggleBtn = document.querySelector<HTMLButtonElement>('.toolbar-qb-btn')
const qbToggleLabel = document.querySelector<HTMLElement>('.toolbar-qb-label')

function applyMode(): void {
  facetSidebar.hidden = mode !== 'browse'
  querySidebar.hidden = mode !== 'builder'
  builderMain.hidden = mode !== 'builder'
  updateCharacterizationsVisibility()
  qbToggleBtn?.classList.toggle('active', mode === 'builder')
  if (qbToggleLabel) qbToggleLabel.textContent = mode === 'builder' ? 'Exit Query Builder' : 'Query Builder'
  // Brackets are measured via getBoundingClientRect, which returns all-zero
  // rects while the tree sits under `display: none` — so the very first
  // render (while browse mode hides the builder) bakes in a collapsed
  // bracket. Recompute once the tree is actually visible.
  if (mode === 'builder') alignBrackets(treeMount)
}

// Leaving the query builder (back to the facet-filter view) can't preserve
// the query: the facet mockup has no way to express what the builder can
// (nested groups, OR, NOT). Rather than let the query silently keep filtering
// results behind a facet UI that doesn't reflect it, switching back resets
// the query — but only after the user confirms, since it's a destructive
// action if they've actually built something.
qbToggleBtn?.addEventListener('click', async () => {
  if (mode === 'builder' && usedPropertyIds(store.get()).size > 0) {
    const ok = await confirmModal({
      title: 'Switch to the filter view?',
      message: 'This will clear your current query and reset the results.',
      confirmLabel: 'Switch to filter view',
    })
    if (!ok) return
    store.update(() => defaultQuery())
  }
  mode = mode === 'browse' ? 'builder' : 'browse'
  applyMode()
})

app.replaceChildren(
  el('div', { class: 'app-layout' }, facetSidebar, querySidebar, shell),
  devMenu,
  modalRoot(),
  infoModalRoot(),
  batchToolbar,
)
applyMode()

/**
 * Colorize the boolean operators in the summary so the sentence carries the
 * same color language as the tree. The text is escaped first; operators are
 * matched as standalone uppercase words. (Caveat: a property/value label that
 * is itself an uppercase AND/OR/NOT would be miscolored — none exist.)
 */
function summaryHtml(text: string): string {
  const escaped = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  return escaped.replace(
    /\b(AND|OR|NOT)\b/g,
    (op) => `<span class="op-${op.toLowerCase()}">${op}</span>`,
  )
}

function renderSummary(): void {
  const noConditionsSet = usedPropertyIds(store.get()).size === 0
  summaryText.classList.toggle('summary-placeholder', noConditionsSet)
  summaryText.classList.toggle('sql', !noConditionsSet && summaryMode === 'sql')
  summaryText.innerHTML = noConditionsSet
    ? 'Pick a property below to start building your query.'
    : summaryHtml(summaryMode === 'sql' ? toSql(store.get()) : summarize(store.get()))
}

// Re-triggered only when the match count actually changes (not on every
// render — pager clicks call renderResults too, but rarely change the
// count), so the badge doesn't pulse on every keystroke-driven re-render.
let lastMatchCount: number | null = null

function updateCharacterizationsVisibility(): void {
  characterizations.hidden = mode !== 'builder' || lastBelowThreshold
}

function renderResults(): void {
  const matches = filterRecords(RECORDS, store.get())
  if (matches.length !== lastMatchCount) {
    lastMatchCount = matches.length
    // Restart the CSS animation: removing the class, forcing a reflow (the
    // offsetWidth read), then re-adding it — a class re-add alone wouldn't
    // restart an already-applied animation.
    resultsCount.classList.remove('pulse')
    void resultsCount.offsetWidth
    resultsCount.classList.add('pulse')
  }
  // A non-zero count below the suppression threshold is withheld — shown
  // only as "<20", never the exact (identifying) small number. Above the
  // threshold, the count itself is never exact either — it's rounded to the
  // nearest 10 and marked "≈", with a disclosure link explaining why
  // (placeholder methodology for now).
  const belowThreshold = isBelowThreshold(matches.length)
  const isRounded = !belowThreshold && matches.length > 0
  const displayCount = approximateCount(matches.length)
  resultsCountNum.textContent = displayCount
  resultsCountLabel.textContent = 'matches'
  // Characterizations' per-value bar charts would be even more identifying
  // than the plain match count at this size, so hide the whole section
  // rather than let its own (already-rounded) bars imply a precision the
  // suppressed count denies.
  lastBelowThreshold = belowThreshold
  updateCharacterizationsVisibility()
  resultsCount.classList.toggle('low-count', belowThreshold)
  resultsCountDisclosure.hidden = !isRounded

  if (toolbarCount) toolbarCount.textContent = displayCount

  clear(resultsTable)
  if (matches.length === 0) {
    resultsPage = 0
    resultsTable.appendChild(el('p', { class: 'results-empty' }, 'No participants match this query.'))
    return
  }
  if (belowThreshold) {
    resultsPage = 0
    resultsTable.appendChild(
      el(
        'div',
        { class: 'results-suppressed' },
        el('p', { class: 'results-suppressed-title' }, 'Too few matching subjects to display'),
        el(
          'p',
          { class: 'results-suppressed-body' },
          `Fewer than ${SUPPRESSION_THRESHOLD} subjects match this query. To protect participant `,
          'privacy, individual results aren’t shown for cohorts this small — remove or broaden ',
          'some filters to see results.',
        ),
      ),
    )
    return
  }

  const pageCount = Math.ceil(matches.length / PAGE_SIZE)
  resultsPage = Math.min(Math.max(resultsPage, 0), pageCount - 1) // clamp to range
  const start = resultsPage * PAGE_SIZE
  const shown = matches.slice(start, start + PAGE_SIZE)

  resultsTable.appendChild(
    el(
      'table',
      { class: 'results-table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { class: 'th-check' }),
          headerCell('Syn ID', headerIcon(HELP_SVG)),
          ...RESULT_COLUMNS.map((id) => {
            const th = headerCell(
              getProperty(id)?.label ?? id,
              ...(id === 'sex' ? [headerIcon(FILTER_SVG)] : []),
            )
            if (isNumericColumn(id)) th.classList.add('num')
            return th
          }),
        ),
      ),
      el(
        'tbody',
        {},
        ...shown.map((rec) =>
          el(
            'tr',
            {},
            el(
              'td',
              { class: 'td-check' },
              el('input', {
                type: 'checkbox',
                class: 'row-check',
                'aria-label': `Select ${rec.id}`,
                checked: selectedIds.has(rec.id),
                onchange: (e: Event) => toggleRowSelected(rec.id, (e.target as HTMLInputElement).checked),
              }),
            ),
            el('td', { class: 'results-id' }, rec.id),
            ...RESULT_COLUMNS.map((id) => {
              const td = el('td', {}, formatCell(id, rec.values[id] ?? null))
              if (isNumericColumn(id)) td.classList.add('num')
              return td
            }),
          ),
        ),
      ),
    ),
  )

  const goto = (page: number) => {
    resultsPage = page
    renderResults()
  }
  resultsTable.appendChild(
    el(
      'div',
      { class: 'results-pager' },
      el(
        'span',
        { class: 'results-range' },
        `Showing ${(start + 1).toLocaleString()}–${(start + shown.length).toLocaleString()}`,
      ),
      el('span', { class: 'spacer' }),
      el(
        'button',
        {
          type: 'button',
          class: 'pager-btn',
          disabled: resultsPage === 0,
          onclick: () => goto(resultsPage - 1),
        },
        '‹ Prev',
      ),
      el('span', { class: 'pager-status' }, `Page ${resultsPage + 1} of ${pageCount.toLocaleString()}`),
      el(
        'button',
        {
          type: 'button',
          class: 'pager-btn',
          disabled: resultsPage >= pageCount - 1,
          onclick: () => goto(resultsPage + 1),
        },
        'Next ›',
      ),
    ),
  )
}

function render(): void {
  // Unmount any date-field React roots from the tree about to be discarded
  // — the full-teardown convention (`clear`) doesn't otherwise call React's
  // own unmount, which would leak/warn.
  unmountAllDateFields()
  clear(treeMount)
  treeMount.appendChild(renderTree(store))
  alignBrackets(treeMount)
  renderSummary()
  // A query change is a new result set — jump back to the first page (pager
  // clicks call renderResults directly and keep their page) and drop any
  // batch selection, since the ids it references may no longer even be in
  // the result set.
  resultsPage = 0
  selectedIds.clear()
  updateBatchToolbar()
  renderResults()
}

store.subscribe(render)
render()

// Bracket heights depend on laid-out child sizes, which change with width.
// Observe the tree mount itself (not the window): when embedded in a host
// page, the container can resize without any window resize. The brackets are
// absolutely positioned, so realigning them never resizes the mount — no
// observer feedback loop.
new ResizeObserver(() => alignBrackets(treeMount)).observe(treeMount)

// Close any open overflow menu when clicking outside it.
document.addEventListener('click', (e) => {
  document.querySelectorAll<HTMLDetailsElement>('details.menu[open]').forEach((menu) => {
    if (!(e.target instanceof Element) || !menu.contains(e.target)) menu.open = false
  })
})

// Preserve nothing special across HMR; just re-render into the fresh module.
if (import.meta.hot) {
  import.meta.hot.accept()
}
