import './style.css'
import { el, clear } from './dom'
import { QueryStore } from './query/store'
import { newQuery, defaultQuery } from './query/model'
import { PRESETS, getPreset } from './query/presets'
import { renderTree, alignBrackets } from './ui/render'
import { summarize } from './query/summary'

const app = document.querySelector<HTMLDivElement>('#app')!

const store = new QueryStore(defaultQuery())

// Persistent shell: header + tree mount + summary. Only the inner regions
// are re-rendered on state change.
const treeMount = el('div', { class: 'tree-mount' })
const summaryText = el('p', { class: 'summary-text' })

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
  el('option', { value: '', disabled: true, selected: true }, 'Load an example…'),
  ...PRESETS.map((p) => el('option', { value: p.id }, p.label)),
)

const shell = el(
  'main',
  { class: 'builder' },
  el(
    'header',
    { class: 'builder-header' },
    el('h1', {}, 'Query Builder'),
    el('div', { class: 'header-tools' }, presetSelect,
      el(
        'button',
        {
          type: 'button',
          class: 'clear-btn',
          onclick: () => store.update(() => newQuery()),
        },
        'Clear all',
      ),
    ),
  ),
  treeMount,
  el(
    'section',
    { class: 'summary' },
    el('h2', {}, 'Reads as'),
    summaryText,
  ),
)

app.replaceChildren(shell)

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

function render(): void {
  clear(treeMount)
  treeMount.appendChild(renderTree(store))
  alignBrackets(treeMount)
  summaryText.innerHTML = summaryHtml(summarize(store.get()))
}

store.subscribe(render)
render()

// Bracket heights depend on laid-out child sizes, which change with width.
window.addEventListener('resize', () => alignBrackets(treeMount))

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
