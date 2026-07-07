# Query Builder

A visual builder for nested boolean queries. The design goal that drives every
decision: **make the relationship between conditions and groups unmistakable.**
Unlike typical query builders, a reader should never have to guess how the
pieces combine.

This document describes the functionality and the style decisions behind it, so
the app can be recreated faithfully. It is written for whoever rebuilds this
(likely with an AI partner) in a real product/stack.

---

## What it does

The user builds a **query tree**:

- The tree is a single root **group**.
- A **group** combines its children with one **combinator** — `AND` or `OR` —
  and may be marked **excluded** (`NOT`), which negates the whole group.
- A group's children are an ordered list of **conditions** and/or nested
  **groups**, to **arbitrary depth**.
- A **condition** filters on one **property** via an **operator**; every
  property kind has its own operator set, and two **presence operators** are
  members of every set:
  - enum: `any` (record has **at least one** selected value — OR), `all`
    (**every** selected value — AND), `none` (**none** of them — NOT)
  - range: `between` / `greater than` / `less than` / `at least` / `at most`
  - boolean: `is` (the Yes/No selection)
  - minimum: `at least`
  - text: `contains` / `starts with` / `ends with` / `is exactly`
  - any kind: `has a value` / `has no value` — a presence (NULL) test on the
    property itself; when chosen, the condition needs **no value input**.

### Key semantic rules

- **One combinator per group.** All of a group's children combine the same way.
  This is deliberate: mixed AND/OR in a flat list is ambiguous (operator
  precedence). Mixed logic is expressed by **nesting a group**, which makes the
  precedence explicit and visible. Do **not** add per-condition operators.
- **Exclusion lives at the group level** (`NOT` on a group) and, for a single
  condition, via the `is none of` operator. There is intentionally **no**
  per-condition exclude toggle — `is none of` already covers it.
- Everything is commutative/associative within a group, so **reordering
  siblings never changes the result** — only moving a node into a *different*
  group changes the logic.

### Plain-English summary

The UI always renders the whole tree as one sentence, e.g.
`Class is any of Mammal, Bird AND NOT (Habitat is any of Desert)`. This is the
legibility backstop — whatever the visual layout does, the logic can be
confirmed in words. Keep this feature.

- The **boolean operators are colorized** (blue AND, amber OR, red NOT, bold)
  to match the tree's color language and to keep comma-separated value lists
  from mushing into the operators. Done by escaping the sentence and wrapping
  standalone uppercase AND/OR/NOT in spans — a label that is itself an
  uppercase operator word would be miscolored (none exist in practice).
- The **root group reads without outer parens**; nested groups keep them, and
  an excluded group is always parenthesized so its NOT has unambiguous scope.
- A **Plain | SQL pill switcher** in the summary head (small segmented
  control, neutral grey active fill — blue/amber actives are reserved for
  AND/OR) swaps the sentence for an **illustrative SQL rendering**: a
  `SELECT * FROM … WHERE` statement, pretty-printed with one child per line,
  combinator-leading continuation lines, and indentation carrying the
  nesting; the same AND/OR/NOT colorizing applies. Property ids stand in as
  column names; enum `any`/`none` → `IN`/`NOT IN`, `all` → AND-chain of
  equalities, boolean → `= TRUE/FALSE`, range → `BETWEEN`/`>`/`<`/`>=`/`<=`
  per operator, minimum → `>= n`, text → `LIKE '%…%'` (wildcards escaped,
  `ESCAPE '\'` added only when needed) or `=` for `is exactly`, presence →
  `IS NULL` / `IS NOT NULL`. Unfinished conditions and empty groups render as
  SQL comments. The view choice is local shell state, not query state.

---

## Data contract (schema)

Properties are the queryable fields. The shape matters; the specific content is
placeholder (see "Not part of the product"). A property's `kind` determines the
input UI:

```ts
type PropertyValue = { id: string; label: string }
type Property =
  | { id; label; kind: 'enum'; ordered: boolean; values: PropertyValue[] }
  | { id; label; kind: 'boolean' }                       // Yes/No
  | { id; label; kind: 'range'; unit?: string }          // min/max numbers
  | { id; label; kind: 'minimum'; options: number[] }    // "at least N+"
  | { id; label; kind: 'text' }                          // free-text (LIKE)
```

The `PROPERTIES` list is **flat — real data has no property categories**, so
the sidebar renders no grouping; any section comments in the data file are
code organization only.

- **enum** — multi-select from fixed values, with the any/all/none operator.
  (`ordered` is inert metadata for a possible future range-style operator.)
- **boolean / range / minimum** — **no operator**; the value input carries the
  whole meaning.
- **No per-option counts.** Production won't have per-value match counts, so
  values carry only `id` + `label`. Don't reintroduce counts.

---

## State model

The query tree is a discriminated union, edited **immutably** — every operation
returns a new tree and never mutates the input:

```ts
type Combinator = 'AND' | 'OR'
type ConditionOp =
  | 'any' | 'all' | 'none'                          // enum
  | 'between' | 'gt' | 'lt' | 'gte' | 'lte'         // range
  | 'is'                                            // boolean
  | 'atLeast'                                       // minimum
  | 'contains' | 'startsWith' | 'endsWith' | 'equals' // text
  | 'hasValue' | 'noValue'                          // presence — any kind
type Condition = {
  kind: 'condition'; id; propertyId: string | null
  op: ConditionOp            // from the property kind's operator set
  valueIds: string[]         // enum
  bool: boolean | null       // boolean
  range: { min: number | null; max: number | null }  // range; gt/gte use min,
                                                      // lt/lte use max
  minimum: number | null     // minimum
  text: string | null        // text
}
type Group = { kind: 'group'; id; combinator; exclude: boolean; children: Node[] }
type Node  = Condition | Group
```

A condition holds one value slot per property kind; only the slot matching its
property's kind is meaningful (presence operators use none). Changing property
resets **all** slots and sets the new kind's default operator
(`defaultOpFor(kind)`: any / between / is / atLeast / contains) — the caller
passes it in, keeping the model ignorant of the schema data.

- Tree edits are pure functions (`setCombinator`, `toggleExclude`, `addChild`,
  `insertChild`, `removeNode`, `clearGroup`, `setProperty`, `setOp`,
  `toggleValue`, `setText`, `moveNode`), each rebuilding only the branch that
  changed.
- A tiny **observable store** holds the current tree, replaces it wholesale on
  each edit, and notifies subscribers.
- The UI **fully re-renders** the tree on every change. This is fine at expected
  sizes; move to keyed diffing only if trees get large.
- `moveNode` guards against dropping a group into itself/its own descendant.

---

## Visual design decisions (the important part)

The layout is framework-free DOM. These decisions are what make it legible;
preserve them.

**Per group, top to bottom:**

1. **Combinator pill at the top of the group** — a segmented `AND | OR` toggle
   that is the *single* control for that group's combinator. Placed at the top
   because the pill marks where the group starts. **Nested groups' pills are a
   size step smaller** than the root's, so the root reads as the frame.
2. **Exclude (NOT) toggle** sits next to the pill in the group header (it's a
   group-level modifier), followed by **+ Condition**, **+ Group**, **Clear**
   (when the group has children) and **Delete Group** (non-root only). All
   head-row action buttons share **one shape and weight** — 30px rounded
   rectangles (6px radius), semibold, **borderless** (a soft fill appears on
   hover; visible strokes made the row too busy) — with color signaling
   intent: blue text = additive, grey text turning red on hover = destructive.
   **Fully-round pills are reserved for value chips**, so controls and data
   never look alike. Buttons sit directly after the other controls, never
   pushed to the far right edge where they'd float ambiguously between nesting
   levels.
3. **A bracket** down the left of the group's children marks the group's scope:
   - A vertical line starts **just below the pill** and runs down to the last
     child, bending inward (a rounded elbow) to point at it. A **matching
     curved branch points at every other child** along the way — every child is
     visibly attached to its group's line.
   - Branches target each child's **identity line**, never its geometric
     center (which drifts into dead space as content wraps or grows): for a
     condition, the first line (its ✕ button); for a nested group, its head
     (pill) row.
   - Because a child's height isn't known until layout, the bracket's `top` and
     `height` are **measured in JS after render** (and on resize), not in CSS.
     The bracket element is absolutely positioned; the content reserves its
     horizontal space with left padding.
     - **Caveat:** the measurement pass must run *after* the tree is in the DOM
       (it reads `getBoundingClientRect`). It re-runs on every render and on
       window resize. If a late layout shift changes row heights after first
       paint (e.g. a web font loading, async content), the bracket can be
       momentarily offset until the next render/resize. With system fonts this
       doesn't happen; if the layout gains such content, drive the pass with a
       `ResizeObserver`/`requestAnimationFrame` instead of just resize.
   - It is **colored by the group's own state** — blue (AND), amber (OR), red
     (excluded) — but **dimmed** (2px, the state color mixed ~40% toward
     white): structure should read without shouting. Scope color rules to the
     group's *own* bracket (direct-child selectors), so an excluded/OR group
     does **not** recolor nested groups' brackets.
   - The bracket appears **whenever the group has children — including just
     one** (the line still ties the child back to its group's pill); only an
     empty group hides it. (The combinator is deliberately *not* repeated as a
     label on the line — the pill plus the line's color carry it.)
4. **A condition is one always-visible row with no editing modes.** There is no
   collapse/expand, no hidden state, nothing to toggle open or closed — every
   part of the row is directly editable in place:
   - A **remove button (trash-can icon, small outlined square) at the start**
     of the row. The glyph is a **muted red** (the exclude red mixed toward
     grey) — destructive but not shouting; full red on hover.
   - **Property** (bold) and **operator** (muted) are styled as **dropdown
     controls** — grey pill with a ▾ caret, so they read as clickable; clicking
     opens a custom **single-select dropdown** (current choice highlighted).
     Picking a new property resets the selected values.
   - **All of the property's values stay on screen as toggle pills** — selected
     pills are filled/blue, unselected are grey outline; click to toggle.
     Selection state is always visible. The pill container is
     `display: contents`, so pills **flow in the row itself**: they start on
     the same line as the operator and wrap like text (never forming their own
     column); the row grows.
   - When the operator is **"is none of"**, selected pills are **red** instead
     of blue — the selection is an exclusion, and red = NOT everywhere in the
     design.
   - **Every kind gets the operator dropdown** (same muted styling — rows
     still read as sentences); the value UI follows the chosen operator:
     - *boolean*: `is` + a **Yes / No pill pair** (same pill style),
       single-select; clicking the active pill clears it.
     - *range*: `is between` **[number] and [number]** (+ optional unit), or
       `is greater/less than` / `is at least/most` + a **single** number
       input. One-sided values live in `min` (gt/gte) or `max` (lt/lte), so
       switching between related operators keeps the number. Inputs commit
       **on change (blur/Enter), never on keystroke** — every store update
       fully re-renders, which would steal focus mid-typing.
     - *minimum*: `is at least` + a dropdown of thresholds rendered as **N+**.
     - *text*: `contains` / `starts with` / `ends with` / `is exactly` + a
       free-text input (commits on change, like the number inputs).
     - **presence** (`has a value` / `has no value`, any kind): the value UI
       disappears entirely — there is nothing to specify.
   - A condition with **no property yet** shows only the property picker and a
     placeholder, **muted via color — never opacity**: opacity < 1 creates a
     stacking context that traps the row's dropdowns underneath later sibling
     rows. (Open menus also get a raised z-index.)
5. **Add condition / Add group** as quiet **text-style buttons** in the group's
   top line, right after the AND/OR pill and Exclude toggle — all of a group's
   controls live on one row, so there is no per-group footer. They're
   persistent chrome and must not compete visually with the query content.

**Across the whole thing:**

- **No container box around groups.** Every level (including root) reads the
  same way: structured purely by its **bracket + indentation**. All groups share
  the same padding, so toggling Exclude changes only color, not layout.
- **Excluded groups have no background fill** — exclusion reads from the red
  bracket and the red "Excluded (NOT)" pill alone.
- **Nesting indent** ≈ 40px per level. Group vertical padding is kept tight so
  the gap between a nested group and its siblings stays close to the gap
  between two condition rows.
- **Hovering a group tints it** (faint grey) to reveal its extent — only the
  **innermost** hovered group, via pure CSS:
  `.group:hover:not(:has(.group:hover))` (a plain `:hover` would tint every
  ancestor at once). The **root is exempt** — it spans everything, so the tint
  adds nothing. On the tinted background the grey inputs would melt away, so
  the same selector **darkens the dropdown/number inputs one step** (and their
  own hover a step further).
- **Consistent control height (30px)** across all row controls — head-row
  pills, inline selectors, and the trash buttons — so every row reads as one
  aligned line, with `--ink-soft`-level contrast (not faint grey).
- **Default startup state:** the builder opens with one blank condition already
  present (as if the user clicked "+ Condition"), not an empty group.
- **Color language:** AND = blue, OR = amber/orange, NOT/exclude = red, search
  hit = yellow. All colors snap to the product design system's **Light tokens**
  (`Light.tokens.json`): the grey ramp for text/borders/fills (gray/950 ink →
  gray/50 faint bg), AND = blue/600 (+ blue/100 soft), OR = orange/600 (+
  orange/50 soft) — dark enough for white text on the active pill to pass
  contrast — NOT = system/red (+ system/red-background soft), search highlight
  = system/yellow + system/yellow-background (dark-yellow for hover). Token
  values live as `--gray-*`-style custom properties at the top of the
  stylesheet; the semantic vars (`--and`, `--or`, `--exclude`, `--ink`, …)
  point at them — style rules use only the semantic vars. Selects are soft
  grey pills (border only on focus). Secondary icon buttons (condition ✕, menu
  trigger) are light-stroked outlined buttons.

---

## Facet sidebar

A **left sidebar** lists every **property** as a selectable row in one flat
list (**no categories** — real data has none). Its purpose is to splay the
properties out where they can be seen, instead of hiding them inside the
builder's dropdown selector — it is **not** for selecting values; values are
always chosen in the builder.

- Each **property row** is a button — clicking it appends a condition for
  that property, **with no value chosen yet**, to the **end of the root
  group**. The value is then picked in the builder. (No kind/type badge on
  the row — just the label.) Hovering a row tints it **light blue** (blue/50)
  and reveals a **"+" affordance** at the row's right edge — a small
  blue-outlined circle (a span, not a nested button; the row itself is the
  button) with a custom dark tooltip below it ("Add a condition on X") via
  CSS `::after`, replacing any native title.
- **Search input** at the top filters the rows by property label *or* value
  label (matching a value surfaces its property). The helper text under the
  search box stays **generic** — it names no example values from the schema.
  Matched substrings are **highlighted**
  (`<mark>`, amber) in property labels. When the match is on a **value**, that
  value appears as a clickable **amber pill** under its property — clicking it
  appends a ready-made condition (property + that value, `is any of`) to the
  end of the root group. This is the only place the sidebar shows values, and
  only while they match the search. Empty categories drop out; the search
  stays fixed while the list scrolls.
- New conditions land in the root group by default; the user then **drags
  them into the proper nested group** — this is why drag-and-drop is enabled.
- Property rows are also **draggable straight into the tree**: dropping one
  on any drop zone creates the new condition at exactly that position (one
  gesture instead of click-then-drag). The in-flight property id crosses the
  sidebar↔tree boundary via a tiny **drag channel module** (`ui/dnd.ts`) —
  needed because HTML5 DnD hides the payload during `dragover`, and kept as
  an explicit shared channel because the sidebar and tree are independent
  components (in a React port: separate components + a context/store). The
  tree's own node-reorder drag state stays private to the render module.
- Properties **used by any condition in the current query** get an "in use"
  highlight (**grey** — gray/100 fill + ink semibold label; a quiet presence
  marker, keeping blue for hover/additive affordances), and their label shows
  a tooltip ("Used in the current query") on hover, so the sidebar doubles as
  an at-a-glance index of what the query touches. Kept current via a store
  subscription that only toggles class/`data-tip`/glyph on the rows.
- The **right edge of a row shows exactly one thing at a time**: not in use →
  nothing, with a blue "+" on hover (adds); in use → a small **checkmark**
  (SVG, ink-soft), swapped on hover for a **red "−"** that **removes every
  condition on that property** from the whole tree (if that empties the tree,
  one blank condition is left — the "never empty" rule). Clicking the row
  body always adds, even when in use (a second condition on the same property
  is legitimate); only the "−" removes.
- The sidebar is persistent chrome: it never re-renders on store changes
  (the usage highlight above is a class toggle, not a re-render); only its
  list region re-renders as the filter text changes (so the search input
  never loses focus).

## Drag-and-drop

Full drag-to-reorder is implemented and **enabled** (`DND_ENABLED` in the
render module): a drag handle per row, thin drop zones between children, and
drop targets scoped per group. It exists so conditions added from the sidebar
(which land at the end of the root group) can be moved into their proper
nested group.

Semantics to keep in mind: **reordering within a group is purely cosmetic**
(AND/OR are commutative), but **dropping into a different group changes the
query's logic** (different combinator / exclude / nesting).

---

## Tech

- Vanilla **TypeScript**, **Vite** dev server with **HMR**, no UI framework.
- DOM is built with a small typed `el(tag, props, ...children)` helper.
- `strict` TS; type-check with `tsc --noEmit`, build with `vite build`.
- Do **not** run the dev server or tests as part of automated changes; verify
  with a type-check/build.

---

## Implementation notes & gotchas

- **`el(tag, props, ...children)` conventions:** `on*` props become
  `addEventListener` (e.g. `onclick`, `onchange`); `class` sets `className`;
  `dataset` merges into `element.dataset`; known interactive props (`disabled`,
  `checked`, `selected`, `value`, `draggable`) are set as properties; anything
  else becomes an attribute. Children may be strings, nodes, or arrays;
  `null`/`false` children are skipped — that's why `cond && el(...)` works for
  conditional rendering.
- **Node ids** are generated by a monotonic in-memory counter (`c-1`, `g-2`, …),
  unique per session. They're for reconciling edits, not persistence.
- **Value selection** is the row of always-visible toggle pills (see design
  section) — `aria-pressed` buttons, shown only once a property is chosen;
  before that, a "pick a property" placeholder shows. Non-enum kinds swap in
  their own controls (Yes/No pills, number inputs, N+ dropdown).
- **Summary phrasing per kind:** enum `is any/all/none of …`; boolean
  `is Yes/No`; range `is between X and Y unit` (or `is greater/less than X`,
  `is at least/most X` per operator); minimum `is at least N`; text
  `contains/starts with/ends with/is exactly "…"`; presence
  `has a value` / `has no value` (any kind). Unset values read as
  `(no value)`.
- **Partial/empty states render gracefully:** a condition with no property, or a
  property with no values selected, still renders and appears in the summary as
  a clearly-unfinished clause rather than breaking.
- **Full re-render on every edit:** event handlers are attached during render
  and the tree is rebuilt wholesale from the store; there is no incremental DOM
  patching. Keep handlers idempotent and derive everything from store state.
- **`data-nodrag` marker:** interactive controls inside a draggable card are
  marked so that grabbing them doesn't start a card drag. Only relevant when
  `DND_ENABLED` is true, but keep the markers if you re-enable DnD.
- **Persistent shell vs. re-rendered region:** the app shell (header, summary
  container) is built once; only the tree region is cleared and re-rendered, and
  the summary text is updated, on each state change.
- **Dropdown menus** (the inline property/operator selects) are native
  `<details>/<summary>` elements — no state management needed; a
  document-level click listener closes any open menu on outside clicks, and
  re-renders naturally close them too. Single-select items also explicitly
  close their own menu, so no-op picks don't leave it hanging open.
- **The property dropdown is filterable** (the operator and N+ ones are not):
  a sticky filter input at the top of its menu narrows the list as you type —
  matching **property labels only, never values** (value search lives in the
  sidebar). Enter picks the first remaining option; the filter resets and
  refocuses each time the menu opens. Filtering is local DOM state (hiding
  items), not store state — a store update would re-render and steal focus.
- **Bracket drawing:** the bracket container is an absolutely-positioned strip;
  the vertical line and per-child branch curves are child divs created during
  the measurement pass (each is a box with left+bottom borders and a rounded
  bottom-left corner — same curve for the main elbow and the branches).

---

## Not part of the product (design scaffolding — omit when rebuilding)

- **Preset selector** in the header ("Load an example…"): a design/testing aid
  to populate the builder with queries of varying complexity. Not a product
  feature.
- **Animal mock data** (Class, Habitat, Diet, …): placeholder content to
  exercise the UI. Real properties/values come from the product's data source;
  only the *schema shape* above is meaningful.
