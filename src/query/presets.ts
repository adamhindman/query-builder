import type { Condition, ConditionOp, Group, Node } from './model'
import { newCondition, newGroup } from './model'

/**
 * Ready-made queries for the "Load an example" picker — realistic cohort
 * definitions over the ELITE-47 schema. Each is built fresh from the model
 * factories (so ids stay unique) and then has its fields filled in.
 */

function cond(propertyId: string, op: ConditionOp, valueIds: string[]): Condition {
  return { ...newCondition(), propertyId, op, valueIds }
}

function boolCond(propertyId: string, value: boolean): Condition {
  return { ...newCondition(), propertyId, op: 'is', bool: value }
}

/** One-sided numeric comparison: gt/gte keep their value in min, lt/lte in max. */
function cmpCond(propertyId: string, op: 'gt' | 'gte' | 'lt' | 'lte', value: number): Condition {
  const usesMin = op === 'gt' || op === 'gte'
  return {
    ...newCondition(),
    propertyId,
    op,
    range: { min: usesMin ? value : null, max: usesMin ? null : value },
  }
}

function textCond(
  propertyId: string,
  op: 'contains' | 'startsWith' | 'endsWith' | 'equals',
  text: string,
): Condition {
  return { ...newCondition(), propertyId, op, text }
}

/** Two-sided numeric range. */
function rangeCond(propertyId: string, min: number, max: number): Condition {
  return { ...newCondition(), propertyId, op: 'between', range: { min, max } }
}

function presenceCond(propertyId: string, op: 'hasValue' | 'noValue'): Condition {
  return { ...newCondition(), propertyId, op }
}

/** Two-sided date range. */
function dateBetweenCond(propertyId: string, min: string, max: string): Condition {
  return { ...newCondition(), propertyId, op: 'between', date: { min, max } }
}

function group(combinator: Group['combinator'], exclude: boolean, children: Node[]): Group {
  return { ...newGroup(combinator), exclude, children }
}

// `age` is enum-kind — 5-year bins starting at 1, with everything 90+
// collapsed into one open-ended top bin (see `data/properties.ts`), not a
// number — these presets want "N and older", so list every bin from N up
// through that open-ended 90+ top bin.
const AGE_BIN_IDS_ASC = [
  'age_1_5',
  'age_6_10',
  'age_11_15',
  'age_16_20',
  'age_21_25',
  'age_26_30',
  'age_31_35',
  'age_36_40',
  'age_41_45',
  'age_46_50',
  'age_51_55',
  'age_56_60',
  'age_61_65',
  'age_66_70',
  'age_71_75',
  'age_76_80',
  'age_81_85',
  'age_86_89',
  'age_90_plus',
]

/** A bin id's starting age — `age_90_plus` reads as 90, everything else is
    the number right after `age_` in the id (e.g. `age_71_75` → 71). */
function binStart(id: string): number {
  return id === 'age_90_plus' ? 90 : Number(id.split('_')[1])
}

/** Every age bin id from the bin containing `minAge` through 90+ — an
    approximation, since a threshold that doesn't land on a bin boundary
    (e.g. 75, which falls inside `age_71_75`) pulls in a few younger ages
    along with it. */
function ageAtLeast(minAge: number): string[] {
  const threshold = minAge >= 90 ? 90 : 1 + 5 * Math.floor((minAge - 1) / 5)
  return AGE_BIN_IDS_ASC.filter((id) => binStart(id) >= threshold)
}

export type Preset = {
  id: string
  label: string
  build: () => Group
}

export const PRESETS: Preset[] = [
  {
    id: 'kitchen-sink',
    label: 'Every condition type',
    // One condition per property kind, no repeats — a flat AND group so
    // each type is easy to pick out on its own, rather than a realistic
    // (and more tangled) cohort definition. The extra `studyKey` condition
    // is a second enum on top of that: it's a 50+ value property, to show
    // the value-pill scrolling tray a short enum like `diagnosis` doesn't
    // trigger.
    build: () =>
      group('AND', false, [
        cond('diagnosis', 'any', ['alzheimers', 'mci']), // enum
        boolCond('hasBiomarkerData', true), // boolean
        rangeCond('visitCode', 2, 4), // range
        textCond('fileName', 'contains', 'ad_'), // text
        dateBetweenCond('enrollmentDate', '2018-01-01', '2022-12-31'), // date
        presenceCond('apoeGenotype', 'hasValue'), // presence
        cond('studyKey', 'any', ['asdoel', 'cdcp', 'study050']), // long enum (50+ values)
      ]),
  },
  {
    id: 'ad-biomarker',
    label: "Alzheimer's cases with biomarkers",
    build: () =>
      group('AND', false, [
        cond('diagnosis', 'any', ['alzheimers', 'mci']),
        boolCond('hasBiomarkerData', true),
        presenceCond('hasCognitiveAssessment', 'hasValue'),
      ]),
  },
  {
    id: 'apoe-e4',
    label: 'APOE-e4 carriers, 75+',
    build: () =>
      group('AND', false, [
        cond('apoeGenotype', 'any', ['e3_e4', 'e4_e4']),
        cond('age', 'any', ageAtLeast(75)),
        cond('diagnosis', 'any', ['alzheimers', 'mci', 'parkinsons']),
      ]),
  },
  {
    id: 'cardiometabolic',
    label: 'Cardiometabolic multimorbidity',
    build: () =>
      group('AND', false, [
        boolCond('hasDiabetes', true),
        boolCond('hasCVD', true),
        group('OR', false, [
          boolCond('hasMI', true),
          boolCond('hasStroke', true),
          boolCond('hasCHF', true),
        ]),
      ]),
  },
  {
    id: 'longevity',
    label: 'Longevity cohort, living 90+',
    build: () =>
      group('AND', false, [
        cond('cohort', 'any', ['llfs', 'centenarian']),
        cond('age', 'any', ageAtLeast(90)),
        boolCond('mortalityStatus', false),
      ]),
  },
  {
    id: 'dementia-methylation',
    label: 'Dementia case–control, methylation data',
    build: () =>
      group('AND', false, [
        group('OR', false, [
          cond('diagnosis', 'any', ['alzheimers', 'vascular_dementia', 'lewy_body', 'ftd']),
          cond('diagnosis', 'any', ['control']),
        ]),
        cond('dataType', 'any', ['dna_methylation']),
        cond('assayType', 'any', ['methylation_array']),
        cmpCond('visitCode', 'gte', 2),
      ]),
  },
  {
    id: 'female-ad-excl',
    label: "Female Alzheimer's, excluding other neurodegeneration",
    build: () =>
      group('AND', false, [
        cond('sex', 'any', ['female']),
        cond('diagnosis', 'any', ['alzheimers']),
        group('OR', true, [
          // excluded (NOT): drop anyone with a competing neurodegenerative dx
          boolCond('hasParkinsons', true),
          cond('diagnosis', 'any', ['lewy_body']),
        ]),
      ]),
  },
  {
    id: 'multiomics-discovery',
    label: 'Multi-omics discovery cohort',
    // Three levels of nesting: a case/control set that must have ANY one of
    // three full modality combinations available, minus a couple of exclusions.
    build: () =>
      group('AND', false, [
        cond('diagnosis', 'any', ['alzheimers', 'mci', 'control']),
        cond('apoeGenotype', 'any', ['e3_e4', 'e4_e4']),
        group('OR', false, [
          group('AND', false, [
            cond('dataType', 'any', ['dna_methylation']),
            cond('assayType', 'any', ['methylation_array']),
          ]),
          group('AND', false, [
            cond('dataType', 'any', ['gene_expression']),
            cond('assayType', 'any', ['rnaseq', 'scrnaseq']),
          ]),
          group('AND', false, [
            cond('dataType', 'any', ['protein_abundance']),
            cond('assayType', 'any', ['proteomics']),
          ]),
        ]),
        group('OR', true, [
          // excluded (NOT)
          cond('diagnosis', 'any', ['other']),
          boolCond('mortalityStatus', true),
        ]),
      ]),
  },
  {
    id: 'matched-controls',
    label: 'Matched female controls across cohorts',
    // Mixes every input kind: enum (including age), boolean, range, nested OR
    // of AND groups, plus an excluded comorbidity group.
    build: () =>
      group('AND', false, [
        cond('sex', 'any', ['female']),
        cond('age', 'any', ageAtLeast(80)),
        group('OR', false, [
          group('AND', false, [
            cond('cohort', 'any', ['llfs']),
            cmpCond('visitCode', 'gte', 3),
          ]),
          group('AND', false, [
            cond('cohort', 'any', ['chs', 'sof']),
            presenceCond('hasCognitiveAssessment', 'hasValue'),
            cond('fieldCenterCode', 'any', ['forsyth_county', 'jackson', 'minneapolis', 'washington_county']),
          ]),
        ]),
        group('OR', true, [
          // excluded (NOT): no major cardiovascular / oncologic history
          boolCond('hasCancer', true),
          boolCond('hasStroke', true),
          boolCond('hasMI', true),
        ]),
      ]),
  },
]

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}
