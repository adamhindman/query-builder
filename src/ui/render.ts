import { el } from '../dom'
import { PROPERTIES, getProperty } from '../data/properties'
import type { Property } from '../data/schema'
import type { Condition, ConditionOp, Group, Node } from '../query/model'
import { newCondition, newGroup, isDescendant } from '../query/model'
import type { QueryStore } from '../query/store'
import {
  addChild,
  clearGroup,
  moveNode,
  removeNode,
  setBool,
  setCombinator,
  setMinimum,
  setOp,
  setProperty,
  setRange,
  toggleExclude,
  toggleValue,
} from '../query/model'

const OP_LABELS: Record<ConditionOp, string> = {
  any: 'is any of',
  all: 'is all of',
  none: 'is none of',
}

/**
 * Drag-and-drop reordering is hidden for now. Flip to `true` to re-enable the
 * drag handles, drop zones, and draggable cards — all the wiring is intact.
 */
const DND_ENABLED = false

/**
 * Drag state lives outside the tree: it's transient UI, not query data.
 * `null` when nothing is being dragged.
 */
let draggingId: string | null = null


/** Build the DOM for the whole query tree. Called on every state change. */
export function renderTree(store: QueryStore): HTMLElement {
  return renderGroup(store, store.get(), true)
}

/**
 * Draw each group's bracket: a vertical line starting just below the group's
 * combinator pill, running down to the LAST child's vertical center (where it
 * elbows inward to point at it), with a matching curved branch pointing at
 * every other child along the way.
 *
 * Child heights aren't known until layout, so the line and branches are
 * measured and (re)built here — this must run after the tree is in the DOM,
 * and again on resize.
 */
export function alignBrackets(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.group-lower').forEach((lower) => {
    const bracket = lower.querySelector<HTMLElement>(':scope > .group-bracket')
    const content = lower.querySelector<HTMLElement>(':scope > .group-content')
    if (!bracket || !content) return

    // Rebuild the drawn parts from scratch each pass.
    bracket
      .querySelectorAll(':scope > .bracket-line, :scope > .bracket-tick')
      .forEach((n) => n.remove())

    const rows = content.querySelectorAll<HTMLElement>(':scope > .condition, :scope > .group')
    if (rows.length === 0) return

    const lowerTop = lower.getBoundingClientRect().top
    const centers = Array.from(rows, (r) => {
      // Anchor at each child's identity line, not its geometric center: a
      // group's head (pill) row, a condition's first line (its remove button).
      // Centers drift into dead space when pills wrap or groups grow tall.
      const anchor = r.classList.contains('group')
        ? (r.querySelector<HTMLElement>(':scope > .group-head') ?? r)
        : (r.querySelector<HTMLElement>('.icon-btn') ?? r)
      const rect = anchor.getBoundingClientRect()
      return rect.top - lowerTop + rect.height / 2
    })
    const lastCenter = centers[centers.length - 1]

    // Main line: from the pill down to the last child's center, elbowing in.
    const line = document.createElement('div')
    line.className = 'bracket-line'
    line.style.height = `${Math.max(lastCenter, 0)}px`
    bracket.appendChild(line)

    // A curved branch pointing at each remaining child.
    const ELBOW = 10
    for (const center of centers.slice(0, -1)) {
      const tick = document.createElement('div')
      tick.className = 'bracket-tick'
      tick.style.top = `${center - ELBOW}px`
      tick.style.height = `${ELBOW}px`
      bracket.appendChild(tick)
    }
  })
}

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------

function renderGroup(store: QueryStore, group: Group, isRoot: boolean): HTMLElement {
  const stateClass = group.exclude ? 'excluded' : group.combinator.toLowerCase()

  // The combinator pill heads the group; below it a left bracket spans — and
  // therefore scopes — the group's children.
  const head = el(
    'div',
    { class: 'group-head' },
    !isRoot && DND_ENABLED && dragHandle(),
    combinatorToggle(store, group),
    excludeToggle(store, group),
    addButton('+ Condition', () => store.update((s) => addChild(s, group.id, newCondition()))),
    addButton('+ Group', () => store.update((s) => addChild(s, group.id, newGroup(group.combinator)))),
    group.children.length > 0 &&
      textButton('Clear', () => store.update((s) => clearGroup(s, group.id))),
    !isRoot && textButton('Delete Group', () => store.update((s) => removeNode(s, group.id))),
  )

  const content = el(
    'div',
    { class: 'group-content' },
    ...renderChildren(store, group),
  )

  // Show the bracket whenever the group has children — even a single child
  // benefits from the line tying it back to its group's pill. Only an empty
  // group hides it (a stub line pointing at nothing reads as a glitch).
  const bracket = group.children.length === 0 ? null : el('div', { class: 'group-bracket' })

  const lower = el('div', { class: 'group-lower' }, bracket, content)

  const card = el(
    'div',
    {
      class: `group ${stateClass}${isRoot ? ' root' : ''}`,
      dataset: { id: group.id },
      draggable: !isRoot && DND_ENABLED,
    },
    head,
    lower,
  )

  if (!isRoot && DND_ENABLED) attachDragSource(card, group.id)
  return card
}

/** Children as borderless rows, separated by drop zones (when DnD is enabled). */
function renderChildren(store: QueryStore, group: Group): HTMLElement[] {
  const kids = group.children
  const out: HTMLElement[] = []
  if (DND_ENABLED) out.push(dropZone(store, group.id, 0))
  if (kids.length === 0) {
    out.push(el('div', { class: 'empty-hint' }, 'No conditions yet — add one above.'))
  }
  kids.forEach((child, i) => {
    out.push(renderNode(store, child))
    if (DND_ENABLED) out.push(dropZone(store, group.id, i + 1))
  })
  return out
}

function renderNode(store: QueryStore, node: Node): HTMLElement {
  return node.kind === 'group'
    ? renderGroup(store, node, false)
    : renderCondition(store, node)
}

// ---------------------------------------------------------------------------
// Condition
// ---------------------------------------------------------------------------

function renderCondition(store: QueryStore, cond: Condition): HTMLElement {
  const property = cond.propertyId ? getProperty(cond.propertyId) : undefined

  const removeBtn = trashButton('Remove condition', () =>
    store.update((s) => removeNode(s, cond.id)),
  )

  const propertySelect = inlineSelect(
    'summary-property',
    property ? property.label : 'Choose a property…',
    PROPERTIES.map((p) => ({
      label: p.label,
      selected: p.id === cond.propertyId,
      onSelect: () => {
        // Re-picking the current property would needlessly wipe its values.
        if (p.id !== cond.propertyId) store.update((s) => setProperty(s, cond.id, p.id))
      },
    })),
  )

  const row = el(
    'div',
    { class: 'condition-summary' },
    removeBtn,
    propertySelect,
    ...(property
      ? conditionControls(store, cond, property)
      : [el('span', { class: 'values-placeholder' }, 'Pick a property to choose values.')]),
  )

  const card = el(
    'div',
    {
      class: `condition${property ? '' : ' unset'}`,
      dataset: { id: cond.id },
      draggable: DND_ENABLED,
    },
    DND_ENABLED && dragHandle(),
    row,
  )

  if (DND_ENABLED) attachDragSource(card, cond.id)
  return card
}

/** The operator/value controls for a condition, chosen by the property kind. */
function conditionControls(store: QueryStore, cond: Condition, property: Property): HTMLElement[] {
  switch (property.kind) {
    case 'enum': {
      const opSelect = inlineSelect(
        'summary-op',
        OP_LABELS[cond.op],
        (Object.keys(OP_LABELS) as ConditionOp[]).map((op) => ({
          label: OP_LABELS[op],
          selected: op === cond.op,
          onSelect: () => store.update((s) => setOp(s, cond.id, op)),
        })),
      )
      // All values stay on screen as toggle pills — selection state is always
      // visible. "is none of" selections are exclusions, so they read red.
      const pills = el(
        'span',
        { class: `value-pills${cond.op === 'none' ? ' negated' : ''}` },
        ...property.values.map((v) => {
          const selected = cond.valueIds.includes(v.id)
          return el(
            'button',
            {
              type: 'button',
              class: `value-pill${selected ? ' selected' : ''}`,
              'aria-pressed': String(selected),
              onclick: () => store.update((s) => toggleValue(s, cond.id, v.id)),
            },
            v.label,
          )
        }),
      )
      return [opSelect, pills]
    }

    case 'boolean': {
      // Yes/No pill pair, single-select; clicking the active one clears it.
      const pill = (value: boolean, label: string) =>
        el(
          'button',
          {
            type: 'button',
            class: `value-pill${cond.bool === value ? ' selected' : ''}`,
            'aria-pressed': String(cond.bool === value),
            onclick: () =>
              store.update((s) => setBool(s, cond.id, cond.bool === value ? null : value)),
          },
          label,
        )
      return [el('span', { class: 'value-pills' }, pill(true, 'Yes'), pill(false, 'No'))]
    }

    case 'range': {
      return [
        el('span', { class: 'input-word' }, 'is between'),
        numberInput(cond.range.min, 'min', (v) =>
          store.update((s) => setRange(s, cond.id, v, cond.range.max)),
        ),
        el('span', { class: 'input-word' }, 'and'),
        numberInput(cond.range.max, 'max', (v) =>
          store.update((s) => setRange(s, cond.id, cond.range.min, v)),
        ),
        ...(property.unit ? [el('span', { class: 'input-word' }, property.unit)] : []),
      ]
    }

    case 'minimum': {
      return [
        el('span', { class: 'input-word' }, 'at least'),
        inlineSelect(
          'summary-op',
          cond.minimum == null ? 'Choose…' : `${cond.minimum}+`,
          property.options.map((n) => ({
            label: `${n}+`,
            selected: cond.minimum === n,
            onSelect: () => store.update((s) => setMinimum(s, cond.id, n)),
          })),
        ),
      ]
    }
  }
}

/**
 * Number input that commits on change (blur/Enter), NOT on every keystroke —
 * each store update triggers a full re-render, which would steal focus
 * mid-typing.
 */
function numberInput(
  value: number | null,
  placeholder: string,
  onCommit: (v: number | null) => void,
): HTMLElement {
  return el('input', {
    type: 'number',
    class: 'num-input',
    dataset: { nodrag: 'true' },
    value: value == null ? '' : String(value),
    placeholder,
    onchange: (e: Event) => {
      const raw = (e.target as HTMLInputElement).value.trim()
      const parsed = raw === '' ? null : Number(raw)
      onCommit(parsed == null || Number.isNaN(parsed) ? null : parsed)
    },
  })
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function combinatorToggle(store: QueryStore, group: Group): HTMLElement {
  const make = (value: Group['combinator']) =>
    el(
      'button',
      {
        type: 'button',
        class: `seg${group.combinator === value ? ' active' : ''}`,
        dataset: { nodrag: 'true' },
        onclick: () => store.update((s) => setCombinator(s, group.id, value)),
      },
      value,
    )
  return el('div', { class: 'segmented', role: 'group', 'aria-label': 'Combine with' }, make('AND'), make('OR'))
}

function excludeToggle(store: QueryStore, group: Group): HTMLElement {
  return el(
    'button',
    {
      type: 'button',
      class: `exclude-toggle${group.exclude ? ' on' : ''}`,
      dataset: { nodrag: 'true' },
      'aria-pressed': String(group.exclude),
      title: 'Exclude records matching this group',
      onclick: () => store.update((s) => toggleExclude(s, group.id)),
    },
    group.exclude ? 'Excluded (NOT)' : 'Exclude (NOT)',
  )
}

function addButton(label: string, onClick: () => void): HTMLElement {
  return el(
    'button',
    { type: 'button', class: 'add-btn', dataset: { nodrag: 'true' }, onclick: onClick },
    label,
  )
}

/** Quiet text button for a group's low-frequency actions (Clear / Delete). */
function textButton(label: string, onClick: () => void): HTMLElement {
  return el(
    'button',
    { type: 'button', class: 'text-btn', dataset: { nodrag: 'true' }, onclick: onClick },
    label,
  )
}

/**
 * Inline dropdown for collapsed condition rows: the summary is styled text
 * showing the current value; the list is a single-select menu.
 */
type InlineOption = { label: string; selected: boolean; onSelect: () => void }

function inlineSelect(labelClass: string, labelText: string, options: InlineOption[]): HTMLElement {
  return el(
    'details',
    { class: 'menu inline-menu', dataset: { nodrag: 'true' } },
    el('summary', { class: `inline-select ${labelClass}` }, labelText),
    el(
      'div',
      { class: 'menu-list' },
      ...options.map((opt) =>
        el(
          'button',
          {
            type: 'button',
            class: `menu-item${opt.selected ? ' selected' : ''}`,
            onclick: (e: Event) => {
              // Close the menu even when the pick is a no-op (no re-render).
              ;(e.currentTarget as HTMLElement).closest('details')?.removeAttribute('open')
              opt.onSelect()
            },
          },
          opt.label,
        ),
      ),
    ),
  )
}

/** Small outlined icon button with a trash-can glyph (inline SVG). */
function trashButton(title: string, onClick: () => void): HTMLElement {
  const btn = el('button', {
    type: 'button',
    class: 'icon-btn',
    title,
    'aria-label': title,
    dataset: { nodrag: 'true' },
    onclick: onClick,
  })
  btn.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 6h18"/>' +
    '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
    '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
    '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>' +
    '</svg>'
  return btn
}

function dragHandle(): HTMLElement {
  return el('span', { class: 'drag-handle', title: 'Drag to reorder', 'aria-hidden': 'true' }, '⠿')
}

// ---------------------------------------------------------------------------
// Drag and drop
// ---------------------------------------------------------------------------

function attachDragSource(card: HTMLElement, id: string): void {
  card.addEventListener('dragstart', (e) => {
    // Don't start a card drag when the user grabbed a form control inside it.
    const target = e.target as HTMLElement
    if (target !== card && target.closest('[data-nodrag]')) {
      e.preventDefault()
      return
    }
    draggingId = id
    card.classList.add('dragging')
    e.dataTransfer?.setData('text/plain', id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    e.stopPropagation() // don't also start a drag on an ancestor group
  })
  card.addEventListener('dragend', () => {
    draggingId = null
    card.classList.remove('dragging')
  })
}

/** A thin insertion line between children. */
function dropZone(store: QueryStore, parentId: string, index: number): HTMLElement {
  const zone = el('div', { class: 'dropzone' })
  makeDropTarget(store, zone, parentId, index)
  return zone
}

function makeDropTarget(store: QueryStore, zone: HTMLElement, parentId: string, index: number): void {
  zone.addEventListener('dragover', (e) => {
    if (!draggingId) return
    // Block dropping a group into itself or one of its descendants.
    if (isDescendant(store.get(), draggingId, parentId)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    zone.classList.add('over')
  })
  zone.addEventListener('dragleave', () => zone.classList.remove('over'))
  zone.addEventListener('drop', (e) => {
    e.preventDefault()
    e.stopPropagation()
    zone.classList.remove('over')
    const id = draggingId
    draggingId = null
    if (id) store.update((s) => moveNode(s, id, parentId, index))
  })
}
