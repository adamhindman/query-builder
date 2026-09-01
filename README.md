# Query Builder

A prototype of a visual builder for nested boolean queries, over a mock
ELITE-47 cohort schema. Vanilla TypeScript + Vite, no UI framework.

**Live demo:** https://adamhindman.github.io/query-builder/

## What this is

The builder lets you assemble a query tree — groups of AND/OR/NOT-combined
conditions, nested to any depth — and shows two live views of it as you edit:

- A **plain-English summary** ("Class is any of Mammal, Bird AND NOT
  (Habitat is any of Desert)") so the logic is always legible in words.
- A **results table**, run against an in-memory mock dataset of ~25,000
  data-file records, so the query actually filters something.

Properties are picked from a filterable dropdown inline on each condition —
there's no standalone property sidebar. A toolbar button switches between
the query builder and a non-functional mockup of a default "browse" faceted
sidebar (styled after eliteportal.synapse.org), for demoing both states of
the eventual product page.

For the full design rationale, semantic rules, and every visual decision
behind this build, see [`CLAUDE.md`](./CLAUDE.md) — that document is the
source of truth for how (and why) this is built, written for whoever
rebuilds this for real.

## Easy-to-miss features

Things that only surface through interaction, hover, or an edge-case state —
not visible from a glance at the default screen.

**Interaction / editing**
- **Drag-and-drop reordering** — conditions and groups can be dragged to
  reorder or moved into a different group (reordering is cosmetic; moving to
  a different group changes the logic).
- **The property picker is searchable by value, not just property name** —
  typing a value label (e.g. "Alzheimer's") surfaces it as a clickable pill
  under its property; clicking it sets the property *and* that value in one
  action. Enter picks the first matching property row.
- **"is none of" turns selected value pills red** instead of blue — the only
  per-condition visual cue that it's an exclusion.
- **Presence operators** ("has a value"/"has no value") make the entire
  value-input UI disappear — easy to miss that this is intentional, not
  broken.
- **Inputs commit on blur, not on keystroke** (number, text, date) — typing
  doesn't visibly do anything until you click away or hit Enter.

**Query Summary box**
- **Plain English / SQL toggle** — a small segmented switch in the summary
  header renders the same query as illustrative SQL.
- **The root group has no outer parentheses**, but nested or excluded groups
  always do — subtle but deliberate for legibility.

**Visual language you have to notice on hover**
- **Hovering a group tints only the innermost group** under the cursor, not
  every ancestor — reveals nesting scope without a border/box.
- **Tooltips on the AND/OR pill and "+ Condition Group"** spell out the "one
  combinator per group, nest to mix logic" rule — the single biggest point
  of confusion in user testing, but the explanation only shows on hover.
- **Excluded groups have no background fill at all** — exclusion is signaled
  purely by the red bracket + pill color, nothing else changes.

**Results table & privacy**
- **The match-count badge only pulses when the count actually changes** (not
  on every render, e.g. paging).
- **Counts are rounded to the nearest 10 with a "≈" and a "Rounded" badge** —
  and a "How this number was computed" disclosure link sits to the badge's
  left (currently placeholder copy).
- **Counts under 20 hide the table entirely** and show "<20" instead of the
  real number, in both places the count appears.
- **Results Distribution charts auto-hide** when the count drops below the
  suppression threshold, and silently reappear once it recovers.
- **The first Results Distribution chart auto-adds itself** the first time
  you pick any chartable property — but only once per page load, even if you
  delete every chart afterward.
- **"Why can't I see the counts?"** is a click-toggled tooltip on each chart,
  not hover.

**Persistence & batch actions**
- **Checking result rows slides up a toolbar from the bottom** of the
  screen; selection survives pager clicks but is cleared on any query
  change.
- **"Add to Download List" doesn't clear your selection** — it's a separate
  action from "done with these rows."
- **The download list persists across reloads** via `localStorage`, but your
  on-page row selection does not — the nav badge count survives, checkboxes
  don't.

**Hidden/dev-only**
- **⌘/Ctrl+\\** opens a floating dev-tools menu with "Clear all."
- **The "Every condition type" sample query is tucked into a "Development
  only" `<optgroup>`** at the bottom of the sample-query dropdown, separate
  from the realistic examples.
- **The browse/facet-sidebar mockup and its mode toggle still fully work
  under the hood** — they're just hidden via a `hidden` attribute on one
  button in `index.html`, not removed.
- **Enum "all"/"none" operators exist end-to-end** (model, evaluator,
  summary, SQL) but are hidden from the operator dropdown — re-enabling is a
  one-line change.

## Development

```sh
npm install
npm run dev      # start the Vite dev server
npm run build    # type-check (tsc) + production build
npm run preview  # preview the production build locally
```

There is no test suite yet — verify changes with `tsc --noEmit` and
`vite build`.

## Deployment

Pushes to `main` auto-deploy to GitHub Pages via
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml).

## What's placeholder vs. reusable

The query tree model, evaluator, and results/summary UI are the reusable
parts. The schema content (property list, mock data), preset queries, and
site chrome (nav bar, "Explore" header, faceted-filter sidebar mockup) are
all placeholder scaffolding to make the prototype demonstrable — see
"Not part of the product" in `CLAUDE.md` for the full list.

## Changelog

Most recent first; not exhaustive back to project start, but covers ongoing
work.

**Results table pager & toolbar fixes**
- The results-table pager is now a persistent element outside the
  horizontally-scrolling table wrap, so it stays fixed in place instead of
  scrolling along with wide tables.
- The static "Hide Filters" toolbar control (belongs to the browse/facet
  mockup) is now hidden while Query Builder mode is active.

**Property sidebar removed**
- Deleted the real, functional property sidebar (`ui/sidebar.ts`) and its
  sidebar-only drag channel (`ui/dnd.ts`). Property browsing/search now
  happens solely through the in-condition property picker dropdown, which
  already had the same filter/highlight logic. The non-functional
  browse-mode facet sidebar mockup is unaffected.

**File-level schema alignment**
- Reworked several properties to match a real file-level data spec:
  `age` is now a plain numeric range instead of a binned enum; `studyCode`
  renamed to `studyKey`; the boolean `ethnicity` property was dropped in
  favor of renaming the `ethnicGroupCode` enum to `ethnicity`.
- Added a new **Biospecimen** property category (Specimen Type, Organ,
  Tissue, Nucleic Acid Source, Cell Type, Is Post-Mortem).
- The results table now shows only genuine file/specimen-level columns,
  dropping individual-level facts that had crept in (diagnosis, age,
  enrollment date, APOE genotype, has-biomarker-data, country code, study
  key, cohort, sex, family-study-participant, is-post-mortem).

**Sample query picker moved into the page**
- The preset-query dropdown moved out of the hidden dev-tools popup into a
  static "Try a sample query" section under the "Cohort Builder" heading,
  with a short onboarding hint. "Clear all" stays dev-only.
- The "Every condition type" preset now has exactly one condition per
  property kind (no repeats) plus a long-enum example (`studyKey`, 50+
  values), and lives in its own "Development only" `<optgroup>` at the
  bottom of the dropdown.

**Characterizations**
- New section between the query builder and the results table: bar charts
  (Plotly, lazy-loaded) showing the current query's matching cohort broken
  down by a user-picked variable — one bar per option. Empty by default;
  add one at a time via a searchable dropdown (enum/boolean properties
  only). No chart ever shows an exact count — every bar is rounded the same
  way the match-count badge is (shared `query/rounding.ts`).

**Large-enum handling**
- Enums with more than 50 values now render their value picker as a
  scrollable, filterable "pill tray" instead of an inline pill list, so a
  property like Study Code (110 dummy values, added to exercise this) stays
  usable. Shared search/highlight logic extracted into `ui/propertySearch.ts`.

**Results table: participants → files**
- The results table now represents **files**, not participants: Synapse-style
  `syn########` row IDs, a new `fileSizeBytes` property, `dataType` /
  `assayType` / `fileFormat` switched to single-valued (one file has one of
  each), and the column set changed to File Name / Data Type / Assay Type /
  File Format / Is Multi-Specimen / File Size / Study Code.
- Query Builder is now the **default view** on load (was the browse/facet
  mockup).
- Added a **privacy suppression threshold**: queries matching 1–19 records
  withhold the table (an explanatory message shows instead) and display
  "<20" in orange rather than the exact count.
- The match-count badge now pulses when the count actually changes; page
  size increased from 20 to 25 rows.

**Query Builder mode transition & help**
- A custom confirm modal (`ui/modal.ts`, replacing the native
  `window.confirm()`) warns before switching to the filter view clears the
  current query — copy names the action, not the side effect.
- Added a "?" help modal explaining how the query builder works.
- Sidebar polish: clearer heading and hint text above the property list, a
  more visible search input (icon + darker border).

**Facet sidebar mockup & layout**
- Long value lists collapse to the first 5 with a "Show all (N)" toggle;
  shrank the default expanded sections to Age/Sex/Diagnosis.
- Fixed a page-level scrollbar bug from the sidebar's height math ignoring
  the static "Explore" header; both sidebars are now static instead of
  sticky/viewport-height.
- Added a static footer mockup matching eliteportal.synapse.org.

**Earlier**
- Results table redesigned to match a reference cohort-browser style
  (checkbox column, header sort/help/filter icons, full-width layout).
- Removed the `minimum` property kind and the Plain|SQL summary switcher;
  temporarily hid "is all of"/"is none of" from the enum operator picker
  (no matching backend API primitive yet).
- Added the non-functional faceted-filter sidebar mockup and the
  "Query Builder" mode toggle; hid the preset-query loader and "Clear all"
  behind a dev-tools menu (⌘/Ctrl+\\).
