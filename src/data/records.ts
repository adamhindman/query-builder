import { PROPERTIES } from './properties'
import type { Property } from './schema'

/**
 * A mock tabular dataset the query builder runs against — a "participants"
 * table. It's generated once from the schema so every property has plausible
 * values of the right shape, and it's what the results panel filters and
 * counts.
 *
 * Placeholder content, like the animal/ELITE mock elsewhere: the *shapes*
 * (one value per property kind, some missing values, some multi-valued enums)
 * are what matter, not the specific rows. Swap in the real data source and the
 * evaluator/results UI keep working unchanged.
 *
 * Generation is seeded, so the same rows appear every load — stable counts
 * while you edit a query.
 */

/** One property's value in a record; the shape follows the property kind. */
export type RecordValue = string[] | number | boolean | string | null

export type ParticipantRecord = {
  id: string
  /** propertyId → value (kind-appropriate). `null` / empty = missing. */
  values: Record<string, RecordValue>
}

export const RECORD_COUNT = 25000

/** Enums a participant can hold *several* of (so the `all` operator matters). */
const MULTI_ENUMS = new Set(['dataType', 'assayType', 'fileFormat'])

/** Fraction of scalar/single values left missing, so presence ops are real. */
const MISSING = 0.08

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
      if (MULTI_ENUMS.has(property.id)) {
        // A subset (possibly empty) — empty reads as "no value" for presence.
        return property.values.filter(() => rand() < 0.33).map((v) => v.id)
      }
      if (rand() < MISSING) return null
      return [pick(rand, property.values).id]
    case 'boolean':
      return rand() < MISSING ? null : rand() < 0.5
    case 'range':
      if (rand() < MISSING) return null
      // visitCode is a small visit count; other range properties (e.g. field
      // center code) span a wider band.
      return property.id === 'visitCode' ? 1 + Math.floor(rand() * 5) : 100 + Math.floor(rand() * 401)
    case 'text':
      return rand() < MISSING ? null : genFileName(rand, index)
  }
}

function generate(): ParticipantRecord[] {
  const rand = makeRng(0x51a9e2)
  const records: ParticipantRecord[] = []
  for (let i = 0; i < RECORD_COUNT; i++) {
    const values: Record<string, RecordValue> = {}
    for (const property of PROPERTIES) values[property.id] = genValue(property, rand, i + 1)
    records.push({ id: `P-${String(i + 1).padStart(4, '0')}`, values })
  }
  return records
}

export const RECORDS: ParticipantRecord[] = generate()
