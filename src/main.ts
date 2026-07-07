import './style.css'
import { el, clear } from './dom'
import { QueryStore } from './query/store'
import { defaultQuery } from './query/model'
import { PRESETS, getPreset } from './query/presets'
import { renderTree, alignBrackets } from './ui/render'
import { renderSidebar } from './ui/sidebar'
import { summarize } from './query/summary'
import { toSql } from './query/sql'

const app = document.querySelector<HTMLDivElement>('#app')!

const store = new QueryStore(defaultQuery())

// Persistent shell: header + tree mount + summary. Only the inner regions
// are re-rendered on state change.
const treeMount = el('div', { class: 'tree-mount' })
const summaryText = el('p', { class: 'summary-text' })

// The summary can read as plain English or as SQL — a pill switcher in the
// summary head picks the view. Local UI state, not query state: it lives
// here in the persistent shell, untouched by tree re-renders.
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
const plainBtn = makeViewBtn('plain', 'Plain')
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

const shell = el(
  'main',
  { class: 'builder' },
  el(
    'header',
    { class: 'builder-header' },
    el('h1', {}, 'Query Builder'),
    el(
      'div',
      { class: 'header-tools' },
      presetSelect,
      el(
        'button',
        {
          type: 'button',
          class: 'clear-btn',
          onclick: () => store.update(() => defaultQuery()),
        },
        'Clear all',
      ),
    ),
  ),
  treeMount,
  el(
    'section',
    { class: 'summary' },
    el(
      'div',
      { class: 'summary-head' },
      el('h2', {}, 'Reads as'),
      el(
        'div',
        { class: 'segmented view-toggle', role: 'group', 'aria-label': 'Summary format' },
        plainBtn,
        sqlBtn,
      ),
    ),
    summaryText,
  ),
)

// Facet sidebar on the left, builder filling the rest.
app.replaceChildren(el('div', { class: 'app-layout' }, renderSidebar(store), shell))

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
  const tree = store.get()
  summaryText.classList.toggle('sql', summaryMode === 'sql')
  summaryText.innerHTML = summaryHtml(summaryMode === 'sql' ? toSql(tree) : summarize(tree))
}

function render(): void {
  clear(treeMount)
  treeMount.appendChild(renderTree(store))
  alignBrackets(treeMount)
  renderSummary()
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
