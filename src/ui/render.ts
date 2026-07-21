import { el } from '../dom'
import { getProperty } from '../data/properties'
import type { Property, PropertyValue } from '../data/schema'
import type { Condition, ConditionOp, Group, Node } from '../query/model'
import {
  newCondition,
  newGroup,
  isDescendant,
  countConditions,
  defaultOpFor,
} from '../query/model'
import type { QueryStore } from '../query/store'
import { draggedPropertyId, endPropertyDrag } from './dnd'
import { filterProperties, highlight } from './propertySearch'
import {
  addChild,
  insertChild,
  clearGroup,
  moveNode,
  removeNode,
  setBool,
  setCombinator,
  setDate,
  setOp,
  setProperty,
  setRange,
  setText,
  toggleExclude,
  toggleValue,
} from '../query/model'
import { mountDateField } from './dateField'

const OP_LABELS: Record<ConditionOp, string> = {
  any: 'is any of',
  all: 'is all of',
  none: 'is none of',
  is: 'is',
  between: 'is between',
  gt: 'is greater than',
  lt: 'is less than',
  gte: 'is at least',
  lte: 'is at most',
  contains: 'contains',
  startsWith: 'starts with',
  endsWith: 'ends with',
  equals: 'is exactly',
  on: 'is on',
  before: 'is before',
  after: 'is after',
  hasValue: 'has a value',
  noValue: 'has no value',
}

/**
 * Each kind's operator choices; the presence pair is universal.
 *
 * 'all' and 'none' are temporarily withheld from enum's choices: the backend
 * API design (see the Cohort Builder 2.0 tech design doc) has no leaf
 * operator for "all of" at all, and "none of" isn't its own primitive either
 * — it only exists as a NOT wrapped around "any of". Until that's resolved,
 * don't let the UI promise operators the API can't yet express. The model
 * still supports both values (EnumOp, evaluate.ts, sql.ts, summary.ts) —
 * only the picker is restricted, so this is easy to re-enable later.
 */
const KIND_OPS: Record<Property['kind'], ConditionOp[]> = {
  enum: ['any', 'hasValue', 'noValue'],
  boolean: ['is', 'hasValue', 'noValue'],
  range: ['between', 'gt', 'lt', 'gte', 'lte', 'hasValue', 'noValue'],
  text: ['contains', 'startsWith', 'endsWith', 'equals', 'hasValue', 'noValue'],
  date: ['on', 'before', 'after', 'between', 'hasValue', 'noValue'],
}

const isPresence = (op: ConditionOp): boolean => op === 'hasValue' || op === 'noValue'

/**
 * Above this many values, an enum's toggle pills stop flowing inline with
 * the operator text (`display: contents`) and move into a capped-height,
 * filterable scrolling tray instead — otherwise a property with, say, 100+
 * values would balloon the condition row into an unusable wall of pills.
 * Every current schema enum is well under this, so it's dormant today; it
 * exists for whenever a large enum shows up. Below the threshold, nothing
 * changes — same pills, same inline flow, same "selection always visible"
 * behavior the design calls for.
 */
const PILL_TRAY_THRESHOLD = 50

/**
 * Drag-and-drop reordering: the sidebar appends new conditions to the root
 * group, so dragging is how they reach their proper nested group. Flip to
 * `false` to hide the drag handles, drop zones, and draggable cards.
 */
const DND_ENABLED = true

/**
 * The between-row "AND"/"OR" combinator connector (see `renderChildren`) is
 * hidden for now, per request — flip to `true` to bring it back.
 */
const COMBINATOR_CONNECTOR_ENABLED = false

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

/**
 * Children as borderless rows, separated by drop zones (when DnD is enabled)
 * and — between every pair of siblings — a small connector label spelling
 * out the group's own combinator ("AND"/"OR"). The pill at the top of the
 * group is the only thing that actually sets the combinator; the connector
 * is a read-only echo of it, placed literally between the rows it joins so
 * it can't be mistaken for a property of the row that follows it (that
 * misreading is exactly what prompted this — testers seeing "OR" and adding
 * a condition sometimes assumed only the new row became "OR-ish", not that
 * toggling the pill already reinterprets every sibling in the group).
 */
function renderChildren(store: QueryStore, group: Group): HTMLElement[] {
  const kids = group.children
  const out: HTMLElement[] = []
  if (DND_ENABLED) out.push(dropZone(store, group.id, 0))
  if (kids.length === 0) {
    out.push(el('div', { class: 'empty-hint' }, 'No conditions yet — add one above.'))
  }
  kids.forEach((child, i) => {
    out.push(renderNode(store, child))
    if (COMBINATOR_CONNECTOR_ENABLED && i < kids.length - 1) {
      out.push(
        el(
          'div',
          { class: `combinator-connector ${group.combinator.toLowerCase()}`, 'aria-hidden': 'true' },
          group.combinator,
        ),
      )
    }
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

  // The tree's last remaining condition can't be removed — an empty builder
  // is pointless (the app opens with one blank condition for the same reason).
  const soleCondition = countConditions(store.get()) === 1
  const removeBtn = trashButton(
    soleCondition ? "The last condition can't be removed" : 'Remove condition',
    () => store.update((s) => removeNode(s, cond.id)),
    soleCondition,
  )

  // Filterable: 40+ properties — typing beats scrolling. Matches property
  // labels *or* value labels, same as the sidebar: a value hit surfaces its
  // property with the matching values as clickable pills underneath, so
  // picking one sets both the property and that value in one click.
  const propertySelect = propertyPickerMenu(store, cond, property)

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

/**
 * The operator/value controls for a condition. Every kind gets an operator
 * dropdown (the kind's own operators plus the universal presence pair); the
 * value UI follows the chosen operator — presence operators need none.
 */
function conditionControls(store: QueryStore, cond: Condition, property: Property): HTMLElement[] {
  const opSelect = inlineSelect(
    'summary-op',
    OP_LABELS[cond.op],
    KIND_OPS[property.kind].map((op) => ({
      label: OP_LABELS[op],
      selected: op === cond.op,
      onSelect: () => store.update((s) => setOp(s, cond.id, op)),
    })),
  )

  // "has a value" / "has no value" test the property itself — no value UI.
  if (isPresence(cond.op)) return [opSelect]

  switch (property.kind) {
    case 'enum': {
      // All values stay on screen as toggle pills — selection state is always
      // visible. "is none of" selections are exclusions, so they read red.
      const negated = cond.op === 'none'
      const pill = (v: (typeof property.values)[number]) => {
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
      }

      if (property.values.length <= PILL_TRAY_THRESHOLD) {
        const pills = el(
          'span',
          { class: `value-pills${negated ? ' negated' : ''}` },
          ...property.values.map(pill),
        )
        return [opSelect, pills]
      }

      // Too many values to flow inline — a capped-height scrolling tray with
      // its own filter input, so finding one value doesn't mean scanning
      // dozens/hundreds of pills. Same pills, same click-to-toggle; only the
      // container changes.
      return [opSelect, valuePillTray(property.values, pill, negated)]
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
      return [opSelect, el('span', { class: 'value-pills' }, pill(true, 'Yes'), pill(false, 'No'))]
    }

    case 'range': {
      const unit = property.unit ? [el('span', { class: 'input-word' }, property.unit)] : []
      if (cond.op === 'between') {
        return [
          opSelect,
          numberInput(cond.range.min, 'min', (v) =>
            store.update((s) => setRange(s, cond.id, v, cond.range.max)),
          ),
          el('span', { class: 'input-word' }, 'and'),
          numberInput(cond.range.max, 'max', (v) =>
            store.update((s) => setRange(s, cond.id, cond.range.min, v)),
          ),
          ...unit,
        ]
      }
      // One-sided comparisons: gt/gte store their value in `min`, lt/lte in
      // `max`, so switching between related operators keeps the number.
      const usesMin = cond.op === 'gt' || cond.op === 'gte'
      const input = usesMin
        ? numberInput(cond.range.min, 'value', (v) =>
            store.update((s) => setRange(s, cond.id, v, null)),
          )
        : numberInput(cond.range.max, 'value', (v) =>
            store.update((s) => setRange(s, cond.id, null, v)),
          )
      return [opSelect, input, ...unit]
    }

    case 'text': {
      return [opSelect, textInput(cond.text, (v) => store.update((s) => setText(s, cond.id, v)))]
    }

    case 'date': {
      if (cond.op === 'between') {
        return [
          opSelect,
          dateInput(cond.date.min, 'From', (v) =>
            store.update((s) => setDate(s, cond.id, v, cond.date.max)),
          ),
          el('span', { class: 'input-word' }, 'and'),
          dateInput(cond.date.max, 'To', (v) =>
            store.update((s) => setDate(s, cond.id, cond.date.min, v)),
          ),
        ]
      }
      // 'on'/'after' keep their value in min, 'before' in max — same
      // min/max convention as range's gt/gte (min) and lt/lte (max).
      const usesMin = cond.op === 'on' || cond.op === 'after'
      const input = usesMin
        ? dateInput(cond.date.min, 'Date', (v) => store.update((s) => setDate(s, cond.id, v, null)))
        : dateInput(cond.date.max, 'Date', (v) => store.update((s) => setDate(s, cond.id, null, v)))
      return [opSelect, input]
    }
  }
}

/**
 * A capped-height, filterable scrolling tray for an enum with more values
 * than fit comfortably inline (see `PILL_TRAY_THRESHOLD`). Same pills, same
 * click-to-toggle — only the container changes: instead of flowing with the
 * operator text, they sit in a scrollable box with a filter input above it,
 * so finding one value doesn't mean scanning the whole list. Local DOM
 * state only (hiding pills), not store state — a store update would
 * re-render and steal focus from the filter input mid-typing.
 */
function valuePillTray(
  values: readonly PropertyValue[],
  pill: (v: PropertyValue) => HTMLElement,
  negated: boolean,
): HTMLElement {
  const items = values.map((v) => ({ value: v, node: pill(v) }))
  const emptyNote = el('div', { class: 'menu-empty' }, 'No matches')
  const applyFilter = (q: string): void => {
    let any = false
    for (const { value, node } of items) {
      const show = value.label.toLowerCase().includes(q)
      node.hidden = !show
      if (show) any = true
    }
    emptyNote.hidden = any
  }
  applyFilter('')

  const input = el('input', {
    type: 'search',
    class: 'value-pill-filter',
    placeholder: `Filter ${values.length} values…`,
    'aria-label': 'Filter values',
    dataset: { nodrag: 'true' },
    oninput: (e: Event) => applyFilter((e.target as HTMLInputElement).value.trim().toLowerCase()),
  })

  return el(
    // Keep the base "value-pills" class (plus "negated") so the existing
    // is-none-of red-selection CSS still matches pills inside this
    // container; "value-pill-tray" overrides its `display: contents` with
    // a real scrollable box.
    'span',
    { class: `value-pills value-pill-tray${negated ? ' negated' : ''}` },
    input,
    el(
      'div',
      { class: 'value-pill-scroll', dataset: { nodrag: 'true' } },
      ...items.map((i) => i.node),
      emptyNote,
    ),
  )
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

/** Text input (text conditions) — commits on change, same as numberInput. */
function textInput(value: string | null, onCommit: (v: string | null) => void): HTMLElement {
  return el('input', {
    type: 'text',
    class: 'num-input text-input',
    dataset: { nodrag: 'true' },
    value: value ?? '',
    placeholder: 'text…',
    onchange: (e: Event) => {
      const raw = (e.target as HTMLInputElement).value.trim()
      onCommit(raw === '' ? null : raw)
    },
  })
}

/**
 * Date input (date conditions) — a MUI X `DateField` mounted into a plain
 * container (see `ui/dateField.tsx`). Commits on blur, same reasoning as
 * `numberInput`/`textInput`: every store update fully re-renders the tree.
 */
function dateInput(value: string | null, label: string, onCommit: (v: string | null) => void): HTMLElement {
  const container = el('div', { class: 'date-field-mount', dataset: { nodrag: 'true' } })
  mountDateField(container, value, label, onCommit)
  return container
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
 * The condition's property picker. Like `inlineSelect` below (filterable,
 * single-select, resets on open), but matches property labels *or* value
 * labels — same search rules as the sidebar (`propertySearch.ts`). A value
 * hit renders its property with the matching values as clickable pills
 * underneath; picking a pill sets the property *and* that value on this
 * condition in one action, instead of requiring a second step afterward.
 */
function propertyPickerMenu(
  store: QueryStore,
  cond: Condition,
  property: Property | undefined,
): HTMLElement {
  const pickProperty = (p: Property) => {
    // Re-picking the current property would needlessly wipe its values.
    if (p.id !== cond.propertyId) store.update((s) => setProperty(s, cond.id, p.id, defaultOpFor(p.kind)))
  }
  const pickPropertyWithValue = (p: Property, valueId: string) =>
    store.update((s) => toggleValue(setProperty(s, cond.id, p.id, defaultOpFor(p.kind)), cond.id, valueId))

  const rows = el('div', { class: 'menu-rows' })
  const emptyNote = el('div', { class: 'menu-empty' }, 'No matches')

  const closeMenu = (from: HTMLElement) => from.closest('details')?.removeAttribute('open')

  const buildRows = (q: string): void => {
    const facets = filterProperties(q)
    emptyNote.hidden = facets.length > 0
    rows.replaceChildren(
      ...facets.map(({ property: p, valueHits }) =>
        el(
          'div',
          { class: 'menu-facet' },
          el(
            'button',
            {
              type: 'button',
              class: `menu-item${p.id === cond.propertyId ? ' selected' : ''}`,
              onclick: (e: Event) => {
                closeMenu(e.currentTarget as HTMLElement)
                pickProperty(p)
              },
            },
            ...highlight(p.label, q),
          ),
          valueHits.length > 0 &&
            el(
              'div',
              { class: 'menu-value-hits' },
              ...valueHits.map((v) =>
                el(
                  'button',
                  {
                    type: 'button',
                    class: 'menu-value-hit',
                    title: `Set ${p.label} is any of ${v.label}`,
                    onclick: (e: Event) => {
                      closeMenu(e.currentTarget as HTMLElement)
                      pickPropertyWithValue(p, v.id)
                    },
                  },
                  ...highlight(v.label, q),
                ),
              ),
            ),
        ),
      ),
    )
  }
  buildRows('')

  const input = el('input', {
    type: 'search',
    class: 'menu-filter',
    placeholder: 'Filter…',
    'aria-label': 'Filter properties or values',
    oninput: () => {
      buildRows(input.value.trim().toLowerCase())
      syncClear()
    },
    onkeydown: (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') rows.querySelector<HTMLElement>('.menu-item')?.click()
    },
  }) as HTMLInputElement
  const clearBtn = el(
    'button',
    {
      type: 'button',
      class: 'filter-clear',
      title: 'Clear filter',
      'aria-label': 'Clear filter',
      onclick: () => {
        input.value = ''
        buildRows('')
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

  const details = el(
    'details',
    { class: 'menu inline-menu', dataset: { nodrag: 'true' } },
    el('summary', { class: 'inline-select summary-property' }, property ? property.label : 'Choose a property…'),
    el('div', { class: 'menu-list' }, el('div', { class: 'menu-filter-bar' }, input, clearBtn, emptyNote), rows),
  ) as HTMLDetailsElement

  // Reset + focus the filter each time the menu opens.
  details.addEventListener('toggle', () => {
    if (!details.open) return
    input.value = ''
    buildRows('')
    syncClear()
    input.focus()
  })
  return details
}

/**
 * Inline dropdown for collapsed condition rows: the summary is styled text
 * showing the current value; the list is a single-select menu.
 *
 * With `filterable`, the menu gets a filter input at its top: typing narrows
 * the options (label substring, case-insensitive), Enter picks the first
 * remaining one, and the filter resets each time the menu opens. Purely local
 * DOM state — no store involvement, so no focus-stealing re-renders.
 */
type InlineOption = { label: string; selected: boolean; onSelect: () => void }

function inlineSelect(
  labelClass: string,
  labelText: string,
  options: InlineOption[],
  filterable = false,
): HTMLElement {
  const items = options.map((opt) =>
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
  )

  const emptyNote = el('div', { class: 'menu-empty' }, 'No matches')
  const applyFilter = (q: string) => {
    let any = false
    items.forEach((item, i) => {
      const show = options[i].label.toLowerCase().includes(q)
      item.hidden = !show
      if (show) any = true
    })
    emptyNote.hidden = any
  }
  applyFilter('')
  const input = el('input', {
    type: 'search',
    class: 'menu-filter',
    placeholder: 'Filter…',
    'aria-label': 'Filter options',
    oninput: () => {
      applyFilter(input.value.trim().toLowerCase())
      syncClear()
    },
    onkeydown: (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') items.find((item) => !item.hidden)?.click()
    },
  }) as HTMLInputElement
  // Clear icon inside the input's right edge, shown only while there's text.
  const clearBtn = el(
    'button',
    {
      type: 'button',
      class: 'filter-clear',
      title: 'Clear filter',
      'aria-label': 'Clear filter',
      onclick: () => {
        input.value = ''
        applyFilter('')
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

  const details = el(
    'details',
    { class: 'menu inline-menu', dataset: { nodrag: 'true' } },
    el('summary', { class: `inline-select ${labelClass}` }, labelText),
    el(
      'div',
      { class: 'menu-list' },
      filterable && el('div', { class: 'menu-filter-bar' }, input, clearBtn, emptyNote),
      ...items,
    ),
  ) as HTMLDetailsElement

  // Reset + focus the filter each time the menu opens.
  if (filterable) {
    details.addEventListener('toggle', () => {
      if (!details.open) return
      input.value = ''
      applyFilter('')
      syncClear()
      input.focus()
    })
  }
  return details
}

/** Small outlined icon button with a trash-can glyph (inline SVG). */
function trashButton(title: string, onClick: () => void, disabled = false): HTMLElement {
  const btn = el('button', {
    type: 'button',
    class: 'icon-btn',
    title,
    'aria-label': title,
    disabled,
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
  // Zones accept two kinds of drag: a node being moved within the tree
  // (draggingId, module-local) and a property from the sidebar (via the
  // cross-component dnd channel), which becomes a new condition on drop.
  zone.addEventListener('dragover', (e) => {
    if (!draggingId && !draggedPropertyId()) return
    // Block dropping a group into itself or one of its descendants.
    if (draggingId && isDescendant(store.get(), draggingId, parentId)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = draggingId ? 'move' : 'copy'
    zone.classList.add('over')
  })
  zone.addEventListener('dragleave', () => zone.classList.remove('over'))
  zone.addEventListener('drop', (e) => {
    e.preventDefault()
    e.stopPropagation()
    zone.classList.remove('over')
    const propertyId = draggedPropertyId()
    if (propertyId) {
      endPropertyDrag()
      const kind = getProperty(propertyId)?.kind
      store.update((s) =>
        insertChild(s, parentId, index, {
          ...newCondition(),
          propertyId,
          op: kind ? defaultOpFor(kind) : 'any',
        }),
      )
      return
    }
    const id = draggingId
    draggingId = null
    if (id) store.update((s) => moveNode(s, id, parentId, index))
  })
}
