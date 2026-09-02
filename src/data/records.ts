import { PROPERTIES } from './properties'
import type { Property } from './schema'

/**
 * A mock tabular dataset the query builder runs against — each row is one
 * **file** (Synapse-style `syn`-prefixed id), not a participant: the results
 * table shows a data-files view (Syn ID, File Name, Data Type, Assay Type,
 * File Format, Is Multi Specimen, Participant Count, File Size, Specimen
 * Type, Organ, Tissue, Nucleic Acid Source, Cell Type, Visit Code) —
 * deliberately excluding
 * participant-level facts (sex, cohort, study, family-study status,
 * post-mortem status, …) even though they're valid conditions to filter on,
 * since a file-level table shouldn't display them as if they were file
 * attributes. Mirrors susheelvarma.com/cohort-builder/'s "Data files" table.
 * It's generated once from the schema so every property has plausible values
 * of the right shape, and it's what the results panel filters and counts.
 *
 * Placeholder content, like the animal/ELITE mock elsewhere: the *shapes*
 * (one value per property kind, some missing values) are what matter, not
 * the specific rows. Swap in the real data source and the evaluator/results
 * UI keep working unchanged.
 *
 * Generation is seeded, so the same rows appear every load — stable counts
 * while you edit a query.
 */

/** One property's value in a record; the shape follows the property kind. */
export type RecordValue = string[] | number | boolean | string | null

export type FileRecord = {
  id: string
  /** propertyId → value (kind-appropriate). `null` / empty = missing. */
  values: Record<string, RecordValue>
}

export const RECORD_COUNT = 25000

/** Fraction of scalar/single values left missing. 0 — every record is fully
    populated, so the Results table never shows a "—" placeholder. (This
    means `has a value`/`has no value` presence operators have nothing to
    actually match against right now; bump this back up if that needs to be
    demonstrable again.) */
const MISSING = 0

const FILE_TOKENS = ['ad', 'ctrl', 'long', 'cvd', 'apoe', 'twin']
const FILE_EXTS = ['bam', 'cram', 'fastq', 'vcf', 'csv', 'idat', 'mzml']

/** Deterministic PRNG (mulberry32) — fixed seed ⇒ stable dataset. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]

function genFileName(rand: () => number, index: number): string {
  return `${pick(rand, FILE_TOKENS)}_${String(index).padStart(4, '0')}.${pick(rand, FILE_EXTS)}`
}

function genValue(property: Property, rand: () => number, index: number): RecordValue {
  switch (property.kind) {
    case 'enum':
      if (rand() < MISSING) return null
      return [pick(rand, property.values).id]
    case 'boolean':
      return rand() < MISSING ? null : rand() < 0.5
    case 'range':
      if (rand() < MISSING) return null
      if (property.id === 'visitCode') return 1 + Math.floor(rand() * 5) // small visit count
      if (property.id === 'fileSizeBytes') return 1_000_000 + Math.floor(rand() * 29_999_000_000) // ~1MB–30GB
      if (property.id === 'age') return 40 + Math.floor(rand() * 66) // 40–105, skews toward the cohort's elderly focus
      if (property.id === 'participantCount') {
        // Mostly pooled multi-sample files, with a smaller share of small
        // single-/few-participant files — most rows show an exact number,
        // with enough in the 1–19 range to still exercise the "<20" display.
        const r = rand()
        if (r < 0.1) return 1
        if (r < 0.2) return 2 + Math.floor(rand() * 18) // 2–19
        return 20 + Math.floor(rand() * 481) // 20–500
      }
      return 100 + Math.floor(rand() * 401) // fallback for any other range property
    case 'text':
      return rand() < MISSING ? null : genFileName(rand, index)
    case 'date': {
      if (rand() < MISSING) return null
      // A plausible enrollment window; deterministic (seeded `rand`), not
      // tied to the real current date.
      const start = Date.UTC(2015, 0, 1)
      const end = Date.UTC(2023, 11, 31)
      return new Date(start + Math.floor(rand() * (end - start))).toISOString().slice(0, 10)
    }
  }
}

/** A Synapse-style file id: "syn" + 8 digits. */
function genSynId(rand: () => number): string {
  return `syn${String(Math.floor(rand() * 1e8)).padStart(8, '0')}`
}

function generate(): FileRecord[] {
  const rand = makeRng(0x51a9e2)
  const records: FileRecord[] = []
  for (let i = 0; i < RECORD_COUNT; i++) {
    const values: Record<string, RecordValue> = {}
    for (const property of PROPERTIES) values[property.id] = genValue(property, rand, i + 1)
    records.push({ id: genSynId(rand), values })
  }
  return records
}

export const RECORDS: FileRecord[] = generate()
