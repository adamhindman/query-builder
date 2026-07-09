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
  participant records, so the query actually filters something.

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
