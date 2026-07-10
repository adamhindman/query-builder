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

A left sidebar lists every queryable property; a toolbar button switches
between that view and a non-functional mockup of a default "browse" faceted
sidebar (styled after eliteportal.synapse.org), for demoing both states of
the eventual product page.

For the full design rationale, semantic rules, and every visual decision
behind this build, see [`CLAUDE.md`](./CLAUDE.md) — that document is the
source of truth for how (and why) this is built, written for whoever
rebuilds this for real.

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
