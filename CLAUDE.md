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
  - date: `is on` / `is before` / `is after` / `is between` (the last
    expresses a closed or one-sided-open date range, same min/max convention
    as range's gt/gte/lt/lte)
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

- A small **Plain English | SQL** segmented switcher sits in the "Query Summary" box's
  header, opposite the heading (`justify-content: space-between`). It's
  local UI state (`summaryMode`, `main.ts`), not query state — switching it
  never touches the store. **SQL** renders the same tree via
  `query/sql.ts`'s `toSql`, an illustrative (not real-database-targeting)
  `SELECT * FROM participants WHERE …` statement: property ids stand in for
  column names, `enum any/none` → `IN`/`NOT IN`, `enum all` → an AND-chain of
  equalities, `boolean` → `= TRUE/FALSE`, `range` → `BETWEEN`/`>`/`<`/`>=`/`<=`,
  `text` → `LIKE`/`=`, presence → `IS NULL`/`IS NOT NULL`, and an excluded
  group → `NOT (...)` — mirroring `summarize()`'s partial-state grace by
  rendering unfinished conditions/empty groups as SQL comments
  (`/* no property chosen */`) instead of breaking. The summary text switches
  to `white-space: pre-wrap` (`.summary-text.sql`) only in this mode, since
  SQL's line breaks/indents carry its nesting instead of prose. Both modes
  share the same operator-colorizing (`summaryHtml`) and the same
  "pick a property" placeholder before any condition is set.
- The **boolean operators are colorized** (blue AND, amber OR, red NOT, bold)
  to match the tree's color language and to keep comma-separated value lists
  from mushing into the operators. Done by escaping the sentence and wrapping
  standalone uppercase AND/OR/NOT in spans — a label that is itself an
  uppercase operator word would be miscolored (none exist in practice).
- The **root group reads without outer parens**; nested groups keep them, and
  an excluded group is always parenthesized so its NOT has unambiguous scope.
- Before **any property has been picked anywhere in the tree** (startup, or
  after "Clear all"), the box shows a short italic placeholder — "Pick a
  property below to start building your query." — instead of running
  `summarize()`, which would otherwise print the technically-accurate but
  unhelpful `(unset condition)`. Checked via
  `usedPropertyIds(tree).size === 0` in `main.ts`'s `renderSummary`.

---

## Mock results (query evaluation)

The builder runs its query against an in-memory **mock data-files table** —
each row is one file, Synapse-style `syn`-prefixed id (`syn` + 8 digits) — and
shows live results, so the query does something, not just render.

- `data/records.ts` generates a **seeded** (stable across reloads) set of
  ~25,000 records from the schema: each property gets a kind-appropriate,
  **single**-valued value — enum → a one-element array of a value id, boolean
  → true/false, range → a number, text → a filename-like string. A fraction
  of values are **missing** (`null` / empty) so the presence operators are
  exercised.
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
  the "Query Summary" sentence as the always-available plain-English check.
- The **Results panel** is a **paginated** table (25 rows per page, prev/next
  + "Page x of y", `RESULT_COLUMNS` in `main.ts` — a representative column
  spanning most kinds/categories, deliberately more than fit most
  viewports) with no border/padding around its container, spanning the full
  remaining browser width to the right of the sidebar, with a 40px margin on
  all sides. Its header row is styled after eliteportal.synapse.org's
  results table: a light-gray header band, a leading checkbox column, a
  decorative sort-glyph in every header cell plus a help icon on ID and a
  filter icon on Sex, and numeric columns right-aligned with tabular
  figures. The header icons and sort-glyphs are pure chrome — the table
  doesn't actually sort or filter — but the **row checkboxes are real**;
  see "Batch selection" below. `.results-table-wrap` scrolls **horizontally** on its own
  (`overflow-x: auto`) once the columns don't fit, rather than the page body
  scrolling or the columns being squeezed — `.results-table` uses
  `width: max-content; min-width: 100%` (not a plain `100%`) specifically so
  it's free to grow past its container instead of always matching it. Page
  index is local UI state, reset to the first page on any query change
  (pager clicks re-render just the results and keep their page). It
  re-renders on every store change, alongside the summary.
- **Privacy suppression threshold** (`SUPPRESSION_THRESHOLD = 20` in
  `main.ts`): mirrors the backend design doc's count-threshold gate. A count
  of exactly **0** is shown as-is (the existing "No participants match this
  query." empty state) — knowing nobody matches isn't sensitive. But a
  **non-zero count below the threshold** is small enough to risk
  re-identifying someone, so:
  - The **table is replaced** with a `.results-suppressed` message ("Too few
    matching subjects to display" + explanation) instead of ever rendering
    the actual rows. No pager.
  - The **match-count badge** turns orange (`.low-count`, reusing the
    OR/`--or` color — not `--exclude` red, which this app reserves for
    NOT/exclusion) and shows **"<20"** rather than the real number, in both
    places the count appears (the header badge and the static toolbar's
    "SUBJECTS MATCHED (n)"). The exact small count is never surfaced
    anywhere in the UI once it's below threshold — only "<20".
- **The total match count is rounded**, not exact — at or above the
  suppression threshold, it's rounded to the nearest 10
  (`Math.round(matches.length / 10) * 10`) and prefixed with **"≈"**, with a
  small orange **"Rounded"** pill next to it (`.results-rounded-badge`,
  reusing the same `--or`/`--or-soft` orange as the low-count badge). To the
  count badge's **left**, outside its tinted background (same treatment as
  the Characterizations "Why can't I see the counts?" link), a **"How this
  number was computed" disclosure link** (`.results-count-disclosure`,
  `.results-count-wrap` holds both) opens the info modal with an explanation —
  currently **placeholder copy** ("Insert methodology here...") to be
  replaced with the real methodology later. None of this applies to the two
  other count states: exact **0** (not sensitive, shown as-is) or the
  suppressed **"<20"** state (already hides the number entirely, so there's
  nothing further to round). The static toolbar's "SUBJECTS MATCHED (n)"
  shows the same rounded/approximate value, so the two counts on screen
  never contradict each other.
- **Sensitive fields:** `age`, `race`, `sex`, `ethnicGroupCode`, `diagnosis`,
  `cohort`, `countryCode`, and `apoeGenotype` are considered sensitive
  quasi-identifiers. Two more were called out by name but don't exist as
  distinct properties in the current schema — "Age Bin" (the existing `age`
  property is already bin-valued, so this may just *be* `age`) and
  "Diagnosis Macro" (a coarser grouping of `diagnosis` that isn't modeled
  yet). Per-value result counts for these fields (and any other enum/boolean
  property) **are** now shown, via the Characterizations bar charts below —
  and are rounded the same way the backend design doc's `FacetPostProcessor`
  framework (ROUNDING / NOISE, §4.5–4.7) protects facet statistics, using
  this app's own `query/rounding.ts` rather than a per-field allowlist (every
  characterizable property is rounded, sensitive or not — simpler, and
  no less protective).
- The match-count badge **pulses** (a quick CSS scale-up-then-settle,
  `.pulse` / `@keyframes results-count-pulse`) whenever the match count
  actually changes value — tracked via a `lastMatchCount` variable in
  `main.ts` so it doesn't retrigger on renders that don't change the count
  (e.g. a pager click, or editing a condition that happens to match the same
  total). The class is removed and re-added (with a forced reflow via an
  `offsetWidth` read in between) rather than just added, since re-adding an
  already-present class wouldn't restart a CSS animation.
- Like the preset selector and the schema content, the **record data is
  placeholder** — real results come from the product's data source; the
  evaluator and results UI are the reusable parts.

## Batch selection

Each result row's leading checkbox (`.row-check`) is real: checking one adds
its Syn ID to a `selectedIds: Set<string>` in `main.ts` — local UI state,
not query state, so it's untouched by the store/re-render cycle that owns
the query tree.

- **The toolbar** (`.batch-toolbar`) is a persistent, fixed-position element
  (built once, not re-created per render, like `resultsCount`) spanning the
  full viewport width at the bottom of the screen, above all other content
  (`z-index`). It's hidden (`transform: translateY(100%)`) until
  `selectedIds.size > 0`, then slides up (`.visible` toggles the transform,
  transitioned) — chosen over a plain `hidden` toggle so a change this
  consequential (the whole set of checked rows) is never silent. It
  disappears the same way the moment the last row is unchecked. **Clear
  selection** sits on the left, colored `--exclude` red (it's a destructive/
  undo-the-selection action, same color language as the rest of the app);
  the **count** and **Add to Download List** button sit on the right. The
  count's own number sits in a small brand-teal pill
  (`.batch-toolbar-count-num`) — the same treatment as the nav's
  `.download-badge` — so the two "count of things" indicators in the UI
  read as one visual language.
- **Selection persists across pager clicks** (`goto` calls `renderResults`
  directly, which rebuilds each checkbox's `checked` from `selectedIds`) —
  a selection can span multiple pages of the same query. It's **cleared on
  any query change** (in `render()`, before `renderResults()`), since the
  ids it references may not even be in the new result set, and clearing
  keeps "what's selected" from silently going stale.
- **"Add to Download List"** unions `selectedIds` into a separate,
  **persisted** `downloadList: Set<string>` (`main.ts`,
  `localStorage['query-builder:download-list']`, JSON array of Syn IDs) and
  updates the nav badge — but deliberately does **not** clear the selection
  or uncheck rows: adding is not the same gesture as being done with the
  selection (that's what "Clear selection" is for), so the rows stay
  checked and the toolbar stays open. Tracking actual ids (a `Set`) rather
  than a running count means adding the same row twice — same session or
  across reloads — never double-counts it.
- **Reload restores the count, deliberately not the checkboxes.** On
  startup, `loadDownloadList()` reads the persisted set once (wrapped in
  try/catch — a corrupted or unavailable `localStorage` just falls back to
  empty) and the nav badge reflects its size immediately. Rows are **not**
  pre-checked from it, and the batch toolbar does **not** reappear on load
  — `selectedIds` always starts empty; the toolbar only shows up again once
  the user checks a row in the new session. The download list and the
  on-page selection are two independent sets that only interact one
  direction, via "Add to Download List".
- **The download badge** (`.download-badge`, static markup in
  `index.html`, `main.ts` owns its text/visibility via `renderDownloadBadge`)
  sits on the nav's download icon (`.site-download`) — brand teal fill,
  white text, deliberately contrasting with the icon itself, which stays a
  plain dark gray (`color: var(--ink-soft)`, via `stroke="currentColor"`)
  regardless of badge state — the icon never signals state, only the badge
  does. Hidden whenever the list is empty (including on a fresh browser
  with nothing ever added); the count caps its **display** at "99+" once
  `downloadList.size` exceeds 99 (the underlying set keeps growing
  normally, only the rendered text clamps).

## Data contract (schema)

Properties are the queryable fields. The shape matters; the specific content is
placeholder (see "Not part of the product"). A property's `kind` determines the
input UI:

```ts
type PropertyValue = { id: string; label: string }
type Property =
  | { id; label; category: string; kind: 'enum'; ordered: boolean; values: PropertyValue[] }
  | { id; label; category: string; kind: 'boolean' }     // Yes/No
  | { id; label; category: string; kind: 'range'; unit?: string } // min/max numbers
  | { id; label; category: string; kind: 'text' }        // free-text (LIKE)
  | { id; label; category: string; kind: 'date' }        // MUI X DateField, min/max ISO strings
```

Every property carries a **`category`** (Demographic & Clinical, Study &
Cohort Design, Data Modality, Assessment Availability, Genetic
Stratification, Comorbidity) that groups the sidebar. `PROPERTIES`'s own
array order matches those groupings; the section comments in the data file
mark the same boundaries the `category` field encodes, kept for
readability. (An earlier version of this document said properties were
flat with no categories — that was wrong; ELITE-47 does have them.)

- **enum** — multi-select from fixed values, with the any/all/none operator
  (only `any` is currently exposed in the UI — see the operator-set bullet
  above). (`ordered` is inert metadata for a possible future range-style
  operator.)
- **boolean** — **no operator**; the value input carries the whole meaning.
- **range** carries its own operator set (`between`/`gt`/`lt`/`gte`/`lte`);
  `gte`/`lte` express an open-ended "at least N" / "at most N" range, so
  there's no separate minimum-only kind.
- **date** carries its own operator set (`on`/`before`/`after`/`between`),
  stored as ISO `YYYY-MM-DD` strings — chosen because they sort/compare
  correctly as plain strings, so `evaluate.ts`/`sql.ts` never need to parse
  them into `Date` objects. The value input is a single MUI X `DateField`
  (`on`/`before`/`after`) or two of them (`between`) — see "MUI X date
  field" under Tech.
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
  | 'on' | 'before' | 'after' | 'between'            // date (shares 'between' with range)
  | 'hasValue' | 'noValue'                          // presence — any kind
type Condition = {
  kind: 'condition'; id; propertyId: string | null
  op: ConditionOp            // from the property kind's operator set
  valueIds: string[]         // enum
  bool: boolean | null       // boolean
  range: { min: number | null; max: number | null }  // range; gt/gte use min,
                                                      // lt/lte use max
  text: string | null        // text
  date: { min: string | null; max: string | null }   // date (ISO YYYY-MM-DD);
                                                      // on/after use min, before uses max
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
     empty group hides it.
4. **A combinator connector** (`.combinator-connector`) — a small, read-only
   "AND"/"OR" label, colored to match (blue/amber) — sits **between every
   pair of sibling rows** within a group (conditions and/or nested groups),
   never before the first or after the last. It exists specifically so
   toggling the group's pill reads as changing the relationship of *every*
   existing sibling, not just newly-added ones: user testing found some
   people read "click OR, then + Condition" as "the new condition becomes
   OR'd in" rather than "the whole group is now OR'd," since the only
   feedback beforehand was the bracket dimming to a different color. Placing
   the word literally between rows (not attached to either one) makes the
   retroactive, whole-group effect unmistakable. It's purely a rendering
   echo of `group.combinator` — clicking it does nothing; only the pill
   toggles the value, and the connector re-renders on every state change
   like everything else.
5. **A condition is one always-visible row with no editing modes.** There is no
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
6. **Add condition / Add group** as quiet **text-style buttons** in the group's
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
placeholder shown in the "browse" view, reached via the "Query Builder"
toolbar button's toggle (the app **opens in Query Builder mode** by
default); this one is the always-live sidebar shown while in that mode.

A **left sidebar** lists every **property** as a selectable row, grouped
under its **`category`** heading (Demographic & Clinical, Study & Cohort
Design, Data Modality, Assessment Availability, Genetic Stratification,
Comorbidity — see `data/properties.ts`). Its purpose is to splay the
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
- **Category headings** (`.sidebar-category`, e.g. "DEMOGRAPHIC & CLINICAL")
  sit above each group's rows — small, uppercase, quieter than the "Select a
  property to add" heading below so that instruction still reads as the
  primary label. Rendered by walking the filtered/searched rows (which stay
  in `PROPERTIES`'s own order, itself already grouped by category) and
  inserting a heading whenever a row's `category` differs from the previous
  row's — so headings appear only for categories that still have at least
  one matching row once a search narrows the list, and drop out entirely
  otherwise.
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

## Characterizations

A section (`ui/characterizations.ts`) between the query builder and the
Results panel: bar charts breaking the **current query's matching cohort**
down by a variable the user picks — one bar per option of that variable
(e.g. a Sex chart with a Male bar and a Female bar). Empty by default; users
add one chart at a time via a plain **`<select>` dropdown** ("Add a
characterization…") listing every not-yet-added characterizable property,
rebuilt (`picker.refresh`) after every add/remove so a property already
charted drops out of the list. Only **enum** and **boolean** properties are
offered — they're the only kinds with a fixed, discrete set of "options" a
bar can represent; range/text properties have no such options and are left
out of the picker entirely. Each added chart gets a small "✕" to remove it;
charts re-render (via `store.subscribe`) whenever the query changes, since
they characterize the *current* result set. Unlike the Results panel below
it, the section has its own **border + padding + radius**
(`.characterizations`, matching `.summary`'s treatment) so it visually
reads as its own region between the builder and the (borderless,
edge-to-edge) Results table.

- **The whole section is hidden while the match count is suppressed**
  (below `SUPPRESSION_THRESHOLD`, the same "<20" state as the match-count
  badge) — even though each bar is already rounded/clamped
  (`approximateCountValue`), a breakdown into several small per-value bars
  would still be more identifying than a single suppressed count at that
  cohort size. Tracked in `main.ts` via `lastBelowThreshold`, combined with
  the current view mode in `updateCharacterizationsVisibility` (so toggling
  in/out of Query Builder mode and a query dropping below the threshold both
  correctly factor into `characterizations.hidden`, whichever happens
  first). Re-showing is automatic — the moment the count rises back to or
  above the threshold, the section reappears with whatever charts were
  already selected still in place (they're never cleared, only hidden).
- **Auto-added once, on the first characterizable property picked.** The
  moment any condition gets a property assigned (typically the tree's
  blank starter condition — its first-ever pick) and no characterization
  has been added yet, a chart for that property appears automatically
  (`maybeAutoAdd` in `renderCharacterizations`), so the section demonstrates
  itself instead of sitting empty until someone finds the dropdown. Gated
  by a one-time `autoAdded` flag — it fires exactly once per page load and
  does **not** re-fire if the user removes every chart afterward (that
  would fight a deliberate "clear this" action). If the first property
  picked isn't characterizable (a range/text kind), nothing is added until
  a characterizable one appears.
- **No chart ever shows an exact count — this is the entire point of the
  feature.** There's no per-bar label at all, only the X axis's own scale
  (see below) — a design choice to keep the *only* place a number appears
  as coarse and glanceable as possible, rather than also printing a precise-
  looking figure next to every bar. Each bar's length goes through the same
  rounding rules as the main match-count badge (`query/rounding.ts`,
  `approximateCountValue`): a count of 0 stays 0; a nonzero count under the
  suppression threshold clamps to the threshold; everything else rounds to
  the nearest 10. Because the *plotted* numbers are already rounded,
  Plotly's own auto-generated axis ticks never land on an exact value
  either — there's no separate "make the axis coarser" step, the privacy
  rounding happens before the numbers ever reach the chart.
- **Charts are horizontal bars** (`orientation: 'h'`) so long option labels
  (e.g. diagnosis names) stay legible without rotating text: **Y axis** =
  one bar per option, bars sized with a strictly linear px-per-option
  height (no min/max clamp) so bar *thickness* stays visually consistent
  across charts regardless of how many options each one has — a floor for
  small option counts (e.g. a 2-option boolean) would make its bars
  noticeably thicker than a chart with more options. Bar corners are
  slightly rounded (`marker.cornerradius`), the Y-axis's own line is
  hidden, and there's extra breathing room between the Y-axis tick labels
  and the bars (`yaxis.ticklabelstandoff`). **X axis** = the rounded count's
  own scale, titled "Approximate count" (with its own `standoff` so the
  title doesn't crowd the tick labels) — the only place a count is visible
  on the chart; the X axis's line and zero-line are both hidden too (no
  dark line at x=0). The property's own label is the Plotly chart title,
  left-aligned and bold (`<b>` in the title text, `x: 0, xanchor: 'left'`).
- Each chart's header row has a **"Why can't I see the counts?" link** next
  to its "✕" remove button — a **click**-toggled (not hover) tooltip
  (`.char-why-tooltip`) explaining the rounding, since the explanation is a
  full sentence that's easy to lose by moving the mouse off a hover target.
  A document-level click listener closes any open tooltip when something
  else is clicked; the toggle button itself stops propagation so its own
  click doesn't immediately re-close it.
- **Rendering:** on every store change (or add/remove), the whole
  `.char-charts` region is cleared and rebuilt from the current
  `selectedIds` list, matching the rest of the app's full-re-render
  convention — no attempt to diff/update individual Plotly traces in place.
- **Plotly is lazy-loaded.** `plotly.js-basic-dist-min` (the trimmed
  bar/scatter/pie trace bundle, not the ~4MB+ full library) is still over
  1MB even minified, so it's fetched via a dynamic `import()`
  (`loadPlotly()`, cached in a module-level promise after the first call)
  the first time a chart is actually drawn — not on initial page load,
  since the section starts empty. `drawChart` is therefore async; it checks
  `plotEl.isConnected` before calling `Plotly.newPlot` in case the store (or
  the selected-variables list) changed again while the import was still in
  flight and this particular card was already discarded by a newer render.
  `displayModeBar: false` keeps Plotly's own toolbar out of what's meant to
  read as a simple report chart, not an interactive analysis tool;
  `responsive: true` handles resizing without extra code.
- **Types:** `plotly.js-basic-dist-min` ships no types of its own — `src/
  plotly-basic.d.ts` declares it as a module with a `default` export typed
  via `@types/plotly.js` (a plain named-exports `.d.ts`, so the shim wraps
  it as a namespace-typed default — matching how Vite/Rollup's CJS interop
  actually exposes a UMD bundle like this one on dynamic `import()`).

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
  below for what it toggles. **Currently hidden** (a plain `hidden` attribute
  in `index.html`, since the app now always opens in and stays in Query
  Builder mode by default — see below) — the element, its click handler,
  and the browse/facet-mockup mode it toggles to are all still fully intact
  under the hood; only its visibility was turned off. `.toolbar-qb-btn` needs
  its own explicit `.toolbar-qb-btn[hidden] { display: none }` override for
  the same reason `.sidebar[hidden]` does (below) — its own
  `display: inline-flex` rule ties the UA `[hidden]` rule's specificity, and
  author styles win that tie, so without the override the button silently
  stayed visible despite the attribute. Remove the attribute
  to bring it back.
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

- Vanilla **TypeScript**, **Vite** dev server with **HMR**, no UI framework
  — **except** the one MUI X date field, below.
- Global font is **DM Sans** (loaded from Google Fonts in `index.html`);
  falls back to `system-ui`. Because a web font changes text metrics after
  first paint, the bracket re-measure (driven by a `ResizeObserver` on the
  tree mount) re-aligns once the font loads — the caveat noted below.
- DOM is built with a small typed `el(tag, props, ...children)` helper.
- `strict` TS; type-check with `tsc --noEmit`, build with `vite build`.
- Do **not** run the dev server or tests as part of automated changes; verify
  with a type-check/build.

### MUI X date field

The one **date**-kind property's value input is a real
[MUI X `DateField`](https://mui.com/x/react-date-pickers/date-field/) (the
"date field" example specifically — a plain segmented text input, not the
full calendar-popup `DatePicker`), not a hand-rolled `<input type="date">`.
This is the one place the app pulls in React — everything else stays plain
DOM, and `@vitejs/plugin-react`/`tsconfig`'s `jsx: "react-jsx"` exist solely
to compile this one component.

- **Split across two files** so the framework-free convention holds for
  everything *except* this: `ui/dateField.ts` is thin and always bundled —
  it only references `Root`'s *type* (erased at compile time, zero runtime
  weight) and holds a `loadImpl()` lazy loader; `ui/dateFieldImpl.tsx` has
  the actual `react`/`react-dom`/`@mui/material`/`@mui/x-date-pickers`/
  `dayjs` value imports and is only ever reached via a dynamic `import()`,
  so Rollup splits it into its own chunk (`dateFieldImpl-*.js`, ~400KB) that
  never loads unless a condition actually renders a date field — the same
  lazy-loading reasoning `characterizations.ts` already uses for Plotly.
- **Uncontrolled, commits on blur.** Every other value input in the tree
  (`numberInput`, `textInput`) commits on change/blur rather than per
  keystroke, because every store update triggers a full tree re-render,
  which would otherwise steal focus mid-edit. `DateField` follows the same
  rule: it's mounted with `defaultValue` (uncontrolled), so its own internal
  state carries an in-progress edit across keystrokes without touching the
  store; `onChange` only updates a local `useRef`, and `onBlur` is what
  actually calls `setDate`/re-renders. A fresh `createRoot` + mount happens
  on every full re-render (matching the app's teardown-and-rebuild
  convention elsewhere), but since no store update happens until blur, an
  in-progress edit is never interrupted by one.
- **Manual unmount, since the app has no other lifecycle hooks.** `clear()`
  tearing down the tree's DOM doesn't call React's own `root.unmount()`,
  which would otherwise leak/warn. `ui/dateField.ts` tracks every mounted
  `Root` in a module-level `Set`; `main.ts`'s `render()` calls
  `unmountAllDateFields()` right before `clear(treeMount)`, once per render.
- **Value format:** ISO `YYYY-MM-DD`, both in the stored `Condition.date`
  fields and in the generated mock data (`data/records.ts`) — chosen so
  `evaluate.ts`/`sql.ts` can compare dates as plain strings without parsing.
- **Restyled to match `.num-input`/`.text-input`**, not MUI's default
  outlined-with-floating-label look: grey pill background, no visible border
  until focus (a 2px `--and` outline, same as the other inputs), 30px height,
  0.85rem font. Two non-obvious gotchas, found by reading
  `node_modules/@mui/x-date-pickers/PickersTextField`'s source rather than
  guessing from `@mui/material`'s regular `TextField`:
  - **Wrong class namespace.** `DateField` does not reuse
    `@mui/material`'s `OutlinedInput` — it has its own
    `PickersOutlinedInput`/`PickersInputBase` components
    (`MuiPickersOutlinedInput-*` / `MuiPickersInputBase-*` classes), and the
    individual date segments (year/month/day, and their placeholder text
    like "YYYY") are rendered by a *further* nested component,
    `PickersSectionList` (`MuiPickersSectionList-*`, its own separate
    namespace again). `focused`/`disabled`/`error` are the exception — MUI's
    shared "global state" classes, so still the generic `Mui-focused` etc.
    even here. All of `.date-field-mount`'s selectors in `style.css` target
    these real names.
  - **No `label` prop.** `DateField`'s empty-section placeholder text
    ("YYYY-MM-DD") only renders at a *visible* dimmed opacity when
    `inputHasLabel` is false (or true with the label actually shrunk into
    its notch) — see `PickersInputBaseSectionsContainer`'s styled
    `variants` in `PickersInputBase.js`. Passing a `label` for its
    accessible name, then hiding it visually via CSS, still leaves
    `inputHasLabel: true` with a never-shrunk label, which falls through to
    the *fully invisible* `opacity: 0` variant instead — the placeholder
    would only appear once focused. Fixed by not passing `label` at all;
    `aria-label` supplies the accessible name without touching that logic.
  - The sections container also has its own default vertical padding and an
    em-based `line-height` that don't naturally settle at 30px — `.date-
    field-mount`'s `.MuiPickersOutlinedInput-input` zeroes the padding and
    pins `line-height: 30px` directly (not an em value) to match the root's
    own fixed, `overflow: hidden` 30px height exactly.

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
- **The property dropdown is filterable** (the operator one is not): a
  sticky filter input at the top of its menu narrows the list as you type —
  and, like the sidebar, matches **property labels *or* value labels**
  (`propertyPickerMenu` in `ui/render.ts`, sharing its matching/highlight
  logic with the sidebar via `ui/propertySearch.ts`). A value hit shows the
  matching values as clickable amber pills under their property (substring
  highlighted, same `<mark>` treatment as the sidebar); clicking one sets
  *both* the property and that value on the condition in a single action —
  `setProperty` then `toggleValue`, composed directly rather than round-
  tripping through two store updates. Clicking the property row itself (not
  a value pill) behaves as before: sets the property with no value chosen.
  Enter picks the first remaining property row (value-hit pills aren't
  reachable via Enter — click only); the filter resets and refocuses each
  time the menu opens. Filtering rebuilds the row list from scratch on each
  keystroke (local DOM state, not store state — a store update would
  re-render and steal focus).
- **Bracket drawing:** the bracket container is an absolutely-positioned strip;
  the vertical line and per-child branch curves are child divs created during
  the measurement pass (each is a box with left+bottom borders and a rounded
  bottom-left corner — same curve for the main elbow and the branches).

---

## Not part of the product (design scaffolding — omit when rebuilding)

- **Demo disclaimer badge** (`.demo-notice`, static markup in `index.html`,
  bottom-left, fixed): "This is a design demo / Functionality is very
  limited / Data is not realistic." Purely a prototype-context label for
  whoever's clicking through this build — has no product meaning and no
  interactivity. Lower `z-index` than the batch-selection toolbar on
  purpose, so the two don't visually fight over the same corner if both
  happen to be showing at once.
- **Preset selector** ("Load an example…") and **Clear all**: design/testing
  aids to populate or reset the builder. Not a product feature — tucked into
  a hidden floating **dev-tools menu** (⌘/Ctrl+\\) rather than shown in the
  main header, so they're out of the way but still reachable while testing.
- **Animal mock data** (Class, Habitat, Diet, …): placeholder content to
  exercise the UI. Real properties/values come from the product's data source;
  only the *schema shape* above is meaningful.
- **Faceted-filter sidebar mockup** (`ui/facetSidebar.ts`): a non-functional
  visual placeholder for the host portal's own default "browse" sidebar
  (checkbox facet sections + an "Available Filters" chip row), styled after
  eliteportal.synapse.org's Cohort Discovery page. It has zero wiring to the
  query tree or results — clicking anything in it does nothing. **This
  prototype itself opens straight into Query Builder mode** (`mode:
  ViewMode = 'builder'` in `main.ts`) rather than this browse mockup, since
  the query builder is the actual point of the demo; the "Query Builder"
  toolbar button toggles back to the browse mockup and forth again. The
  results panel stays visible either way. Omit the mockup entirely when
  rebuilding — it exists only to demo the before/after of leaving Query
  Builder mode.
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
