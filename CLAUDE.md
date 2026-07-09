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
    (**every** selected value — AND), `none` (**none** of them — NOT). **`all`
    and `none` are currently hidden from the operator dropdown** — the
    backend API design has no matching primitive for either yet (`none` only
    exists there as NOT-wrapped-around-`any`, and `all` has no equivalent at
    all). The model, evaluator, and summary/SQL-style rendering still support
    both; only the UI picker is restricted (`KIND_OPS` in `ui/render.ts`), so
    re-enabling them later is a one-line change.
  - range: `between` / `greater than` / `less than` / `at least` / `at most`
    (the last two express an open-ended range)
  - boolean: `is` (the Yes/No selection)
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

---

## Mock results (query evaluation)

The builder runs its query against an in-memory **mock participants table** and
shows live results — so the query does something, not just render.

- `data/records.ts` generates a **seeded** (stable across reloads) set of
  ~25,000 records from the schema: each property gets a kind-appropriate value —
  enum → array of value ids (a few enums are **multi-valued** per record so
  `all` is meaningful; the rest single), boolean → true/false, range →
  a number, text → a filename-like string. A fraction of values are **missing**
  (`null` / empty) so the presence operators are exercised.
- `query/evaluate.ts` is the runtime twin of `summary.ts`: same operator
  semantics, evaluated against a record. `matchesGroup` handles
  combinator + exclude (an **empty group constrains nothing** → matches);
  `matchesCondition` implements every operator. **Partial-state rule:** an
  incomplete condition (no property, or an operator with no value yet) adds
  **no constraint** — it matches every record — so the startup blank condition
  reads as "all N participants". Missing values fail value comparisons but are
  what `has no value` looks for.
- The **match count** lives as a badge next to the "Query Builder" H1
  (`space-between` in the header row) — not above the results table. It's a
  lightly-rounded (not fully pill-shaped) chip tinted with the site's teal
  brand color (`#39ac97`, the same one used for nav/tab highlights), showing
  a large bold number (`.results-count-num`) next to a smaller muted label
  (`.results-count-label`) reading "N subjects matched". The "Results"
  heading above the table is a plain, uncounted H3 — the count doesn't
  appear twice.
- A small circular **"?" help button** (`.qb-help-btn`) sits right next to
  the "Query Builder" H1 (grouped together in `.builder-title-group`, so the
  header's `space-between` still has just two flex children — the title
  group and the match-count badge). It opens the **info modal**
  (`ui/modal.ts`'s `infoModal`/`infoModalRoot`, a sibling of the confirm
  modal that reuses the same `.modal-*` CSS but has a single "Got it" button
  instead of Cancel/Confirm) with a short bullet list covering: one AND/OR
  per group + nesting for mixed logic, group-level NOT vs. the per-condition
  "is none of", what a condition does, drag-to-reorder/move semantics, and
  the "Reads as" sentence as the always-available plain-English check.
- The **Results panel** is a **paginated** table (25 rows per page, prev/next
  + "Page x of y", a representative column per kind) with no border/padding
  around its container, spanning the full remaining browser width to the
  right of the sidebar (not capped at the builder's 1600px max-width), with a
  40px margin on all sides. Its header row is styled after
  eliteportal.synapse.org's results table: a light-gray header band, a
  leading (non-functional) checkbox column, a decorative sort-glyph in every
  header cell plus a help icon on ID and a filter icon on Sex, and numeric
  columns right-aligned with tabular figures. These header icons and
  checkboxes are pure chrome — the table doesn't actually sort, filter, or
  select rows. Page index is local UI state, reset to the first page on any
  query change (pager clicks re-render just the results and keep their
  page). It re-renders on every store change, alongside the summary.
- Like the preset selector and the schema content, the **record data is
  placeholder** — real results come from the product's data source; the
  evaluator and results UI are the reusable parts.

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
  | { id; label; kind: 'text' }                          // free-text (LIKE)
```

The `PROPERTIES` list is **flat — real data has no property categories**, so
the sidebar renders no grouping; any section comments in the data file are
code organization only.

- **enum** — multi-select from fixed values, with the any/all/none operator
  (only `any` is currently exposed in the UI — see the operator-set bullet
  above). (`ordered` is inert metadata for a possible future range-style
  operator.)
- **boolean** — **no operator**; the value input carries the whole meaning.
- **range** carries its own operator set (`between`/`gt`/`lt`/`gte`/`lte`);
  `gte`/`lte` express an open-ended "at least N" / "at most N" range, so
  there's no separate minimum-only kind.
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
  | 'contains' | 'startsWith' | 'endsWith' | 'equals' // text
  | 'hasValue' | 'noValue'                          // presence — any kind
type Condition = {
  kind: 'condition'; id; propertyId: string | null
  op: ConditionOp            // from the property kind's operator set
  valueIds: string[]         // enum
  bool: boolean | null       // boolean
  range: { min: number | null; max: number | null }  // range; gt/gte use min,
                                                      // lt/lte use max
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

This section describes the **real, functional** property sidebar
(`ui/sidebar.ts`) that sits alongside the query builder. It's a different
thing from the **faceted-filter sidebar mockup** (`ui/facetSidebar.ts`,
described under "Not part of the product") — that one is a non-functional
placeholder shown in the default "browse" view, before the user enters Query
Builder mode; this one is the always-live sidebar shown once they do.

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
- A small uppercase **"Select a property to add"** heading
  (`.sidebar-list-heading`) sits above the property list — a one-line label
  naming what clicking a row does, since nothing else in the sidebar states
  that up front.
- **Search input** at the top filters the rows by property label *or* value
  label (matching a value surfaces its property). The helper text under the
  search box is a short, **generic** one-liner ("Click a property below to
  add it to the query builder.") — it names no example values from the
  schema, and describes what clicking does rather than repeating the search
  box's own placeholder text. Matched substrings are **highlighted**
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

## Site chrome mockup (not part of the product)

Three static, **non-functional** mockups in `index.html` (outside `#app`, so
the app's re-renders never touch them) make the page resemble the host ELITE
Portal — layout only, so the builder looks at home in its eventual page. Omit
when rebuilding, like the preset selector.

- A **fixed top nav**: the ELITE Portal logo (full SVG with wordmark), nav
  links (`#87878b`, green `#39ac97` when active/hovered; Explore active with a
  green underline), a grey download icon, and an avatar. `body` gets
  `padding-top: var(--nav-h)` so nothing hides under the nav.
- A full-width **Explore section header** above the app: an "Explore" title, a
  sub-tab row (Cohort Discovery active, green underline; same color rules as
  the nav), and a grey toolbar strip with a green "Hide Filters" control and
  green action icons. Its title reads "SUBJECTS MATCHED (n)" where **n is the
  live match count** — one of two non-static bits of chrome: `main.ts` updates
  the `.toolbar-count` span (which lives in `index.html`) inside
  `renderResults`.
- The toolbar's icon cluster also holds a real, interactive **"Query
  Builder" button** (`.toolbar-qb-btn`, styled like "Hide Filters" — teal
  text, no border) — the second non-static bit of chrome, and the one actual
  control the static markup exposes. `main.ts` attaches its click handler and
  flips its label to "Exit Query Builder" while active. See "Facet sidebar"
  below for what it toggles.
- A hidden **dev-tools menu** (`.dev-menu`, a floating card) holds the
  preset-query loader and "Clear all" — pulled out of the main header so they
  don't clutter the product surface. It's toggled by **⌘/Ctrl+\\** and starts
  closed; like the preset selector itself, omit it when rebuilding.
- A **site footer** below `#app`, matching eliteportal.synapse.org's: a teal
  top band (brand title + "POWERED BY [mark] Sage Bionetworks" + "Contact
  Us"/"Terms of Service" links) over a slightly darker teal bottom band
  ("Version Number", an "Experimental Mode" label with an info glyph and a
  static on/off toggle, and a centered legal line — org status, EIN, "Trust
  Center", "IRS Form 990"). The Sage Bionetworks mark is a placeholder SVG
  (no real logo asset was provided); the toggle is a styled span, not a real
  control, matching the rest of this section's "layout only" scaffolding.

## Tech

- Vanilla **TypeScript**, **Vite** dev server with **HMR**, no UI framework.
- Global font is **DM Sans** (loaded from Google Fonts in `index.html`);
  falls back to `system-ui`. Because a web font changes text metrics after
  first paint, the bracket re-measure (driven by a `ResizeObserver` on the
  tree mount) re-aligns once the font loads — the caveat noted below.
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
  their own controls (Yes/No pills, number inputs).
- **Summary phrasing per kind:** enum `is any/all/none of …`; boolean
  `is Yes/No`; range `is between X and Y unit` (or `is greater/less than X`,
  `is at least/most X` per operator); text
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

- **Preset selector** ("Load an example…") and **Clear all**: design/testing
  aids to populate or reset the builder. Not a product feature — tucked into
  a hidden floating **dev-tools menu** (⌘/Ctrl+\\) rather than shown in the
  main header, so they're out of the way but still reachable while testing.
- **Animal mock data** (Class, Habitat, Diet, …): placeholder content to
  exercise the UI. Real properties/values come from the product's data source;
  only the *schema shape* above is meaningful.
- **Faceted-filter sidebar mockup** (`ui/facetSidebar.ts`): a non-functional
  visual placeholder for the host portal's default "browse" sidebar
  (checkbox facet sections + an "Available Filters" chip row), styled after
  eliteportal.synapse.org's Cohort Discovery page. It has zero wiring to the
  query tree or results — clicking anything in it does nothing. The
  "Query Builder" toolbar button swaps it for the real sidebar and reveals
  the query builder (header/tree/summary); the results panel stays visible
  either way. Omit entirely when rebuilding — it exists only to demo the
  before/after of entering Query Builder mode.
  - **Leaving the query builder resets the query.** The facet mockup can't
    express the query builder's full range (nested groups, OR, NOT) — there's
    no faithful way to hand a complex tree back to a flat facet checklist. So
    switching from Query Builder mode back to the facet view **clears the
    query** (`defaultQuery()`) rather than leave it silently filtering results
    behind a facet UI that doesn't reflect it. Since that's destructive, it's
    gated behind a confirmation — a custom modal (`ui/modal.ts`, matching the
    app's own look rather than a native `window.confirm()`) — but only when
    the query is actually non-trivial (`usedPropertyIds(tree).size > 0`; the
    default blank starter condition doesn't trigger it). Its copy names the
    action the user is choosing ("Switch to the filter view?" / "Switch to
    filter view") rather than the side effect ("Clear query") — the query
    reset is a consequence of switching views, not the thing being confirmed.
    Canceling the confirm leaves
    the user in Query Builder mode, query untouched.
