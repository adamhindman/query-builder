import type { Property, PropertyValue } from './schema'

// Dummy filler so Study Code has 110 values total — exercises the
// value-pill scrolling tray (PILL_TRAY_THRESHOLD in ui/render.ts), which
// only kicks in past 20 values and has no real property large enough yet.
const DUMMY_STUDY_CODES: PropertyValue[] = Array.from({ length: 103 }, (_, i) => {
  const n = String(i + 8).padStart(3, '0')
  return { id: `study${n}`, label: `STUDY${n}` }
})

/**
 * Cohort-definition fields imported from the ELITE "Curated 47" spec used by
 * https://susheelvarma.com/cohort-builder/ (elite47.spec.json).
 *
 * Widget → kind mapping:
 *   multiselect → enum      bins → enum      minCount → range      range → range
 *   boolean     → boolean
 *
 * The 2 internal/hidden fields (familyID, hasHypertension) are omitted.
 *
 * Multiselect option values (Sex, Diagnosis, Race, …) are not in the spec —
 * they were supplied separately and filled in below. Acronym casing in labels
 * has been tidied (e.g. "Has Cvd" → "Has CVD").
 *
 * The list is flat — real data has no property categories. The section
 * comments below are code organization only; nothing in the UI reads them.
 */
export const PROPERTIES: Property[] = [
  // ── Demographic & Clinical ──────────────────────────────────────────
  {
    id: 'age',
    label: 'Age',
    kind: 'enum',
    ordered: true,
    values: [
      { id: 'lt70', label: '<70' },
      { id: '70_74', label: '70–74' },
      { id: '75_79', label: '75–79' },
      { id: '80_84', label: '80–84' },
      { id: '85_89', label: '85–89' },
      { id: '90plus', label: '90+' },
    ],
  },
  {
    id: 'sex',
    label: 'Sex',
    kind: 'enum',
    ordered: false,
    values: [
      { id: 'female', label: 'Female' },
      { id: 'male', label: 'Male' },
      { id: 'unknown', label: 'Unknown' },
    ],
  },
  {
    id: 'diagnosis',
    label: 'Diagnosis',
    kind: 'enum',
    ordered: false,
    values: [
      { id: 'alzheimers', label: "Alzheimer's Disease" },
      { id: 'anxiety', label: 'Anxiety Disorder' },
      { id: 'breast_cancer', label: 'Breast Cancer' },
      { id: 'colorectal_cancer', label: 'Colorectal Cancer' },
      { id: 'control', label: 'Control' },
      { id: 'ftd', label: 'Frontotemporal Dementia' },
      { id: 'lewy_body', label: 'Lewy Body Dementia' },
      { id: 'longevity', label: 'Longevity / Centenarian' },
      { id: 'lung_cancer', label: 'Lung Cancer' },
      { id: 'mdd', label: 'Major Depressive Disorder' },
      { id: 'mci', label: 'Mild Cognitive Impairment' },
      { id: 'other', label: 'Other' },
      { id: 'parkinsons', label: "Parkinson's Disease" },
      { id: 'prostate_cancer', label: 'Prostate Cancer' },
      { id: 'vascular_dementia', label: 'Vascular Dementia' },
    ],
  },
  {
    id: 'diagnosisStatus',
    label: 'Diagnosis Status',
    kind: 'boolean',
  },
  {
    id: 'race',
    label: 'Race',
    kind: 'enum',
    ordered: false,
    values: [
      { id: 'american_indian', label: 'American Indian or Alaska Native' },
      { id: 'ashkenazi_jewish', label: 'Ashkenazi Jewish' },
      { id: 'asian', label: 'Asian' },
      { id: 'black', label: 'Black or African American' },
      { id: 'multiracial', label: 'Multiracial' },
      { id: 'pacific_islander', label: 'Native Hawaiian or Pacific Islander' },
      { id: 'other', label: 'Other' },
      { id: 'unknown', label: 'Unknown' },
      { id: 'white', label: 'White' },
    ],
  },
  {
    id: 'ethnicity',
    label: 'Ethnicity',
    kind: 'boolean',
  },
  {
    id: 'ethnicGroupCode',
    label: 'Ethnic Group Code',
    kind: 'enum',
    ordered: false,
    values: [
      { id: 'admixed', label: 'Admixed' },
      { id: 'african', label: 'African' },
      { id: 'ashkenazi', label: 'Ashkenazi' },
      { id: 'east_asian', label: 'East Asian' },
      { id: 'northern_european', label: 'Northern European' },
      { id: 'southern_european', label: 'Southern European' },
      { id: 'unknown', label: 'Unknown' },
    ],
  },
  {
    id: 'mortalityStatus',
    label: 'Mortality Status',
    kind: 'boolean',
  },
  {
    id: 'yearsOfEducation',
    label: 'Years of Education',
    kind: 'boolean',
  },

  // ── Study & Cohort Design ───────────────────────────────────────────
  {
    id: 'cohort',
    label: 'Cohort',
    kind: 'enum',
    ordered: false,
    values: [
      { id: 'arivale', label: 'Arivale' },
      { id: 'chs', label: 'CHS' },
      { id: 'centenarian', label: 'Centenarian' },
      { id: 'denmark_family', label: 'Denmark Family' },
      { id: 'llfs', label: 'LLFS' },
      { id: 'sof', label: 'SOF' },
    ],
  },
  {
    id: 'studyCode',
    label: 'Study Code',
    kind: 'enum',
    ordered: false,
    values: [
      { id: 'asdoel', label: 'ASDOEL' },
      { id: 'cdcp', label: 'CDCP' },
      { id: 'hsdoa', label: 'HSDOA' },
      { id: 'ilo', label: 'ILO' },
      { id: 'lc', label: 'LC' },
      { id: 'lg', label: 'LG' },
      { id: 'llfs', label: 'LLFS' },
      ...DUMMY_STUDY_CODES,
    ],
  },
  {
    id: 'countryCode',
    label: 'Country Code',
    kind: 'enum',
    ordered: false,
    values: [
      { id: 'denmark', label: 'Denmark' },
      { id: 'us', label: 'US' },
    ],
  },
  {
    id: 'fieldCenterCode',
    label: 'Field Center Code',
    kind: 'range',
  },
  {
    id: 'visitCode',
    label: 'Visit Code',
    kind: 'range',
  },
  {
    id: 'familyStudyParticipant',
    label: 'Family Study Participant',
    kind: 'boolean',
  },
  {
    id: 'hasMZTwinData',
    label: 'Has MZ Twin Data',
    kind: 'boolean',
  },

  // ── Data Modality ───────────────────────────────────────────────────
  {
    id: 'dataType',
    label: 'Data Type',
    kind: 'enum',
    ordered: false,
    values: [
      { id: 'dna_methylation', label: 'DNA methylation' },
      { id: 'gene_expression', label: 'gene expression' },
      { id: 'metabolite_levels', label: 'metabolite levels' },
      { id: 'protein_abundance', label: 'protein abundance' },
      { id: 'variant_calls', label: 'variant calls' },
    ],
  },
  {
    id: 'assayType',
    label: 'Assay Type',
    kind: 'enum',
    ordered: false,
    values: [
      { id: 'rnaseq', label: 'RNAseq' },
      { id: 'wes', label: 'WES' },
      { id: 'wgs', label: 'WGS' },
      { id: 'metabolomics', label: 'metabolomics' },
      { id: 'methylation_array', label: 'methylation array' },
      { id: 'proteomics', label: 'proteomics' },
      { id: 'scrnaseq', label: 'scRNAseq' },
    ],
  },
  {
    id: 'fileFormat',
    label: 'File Format',
    kind: 'enum',
    ordered: false,
    values: [
      { id: 'bam', label: 'BAM' },
      { id: 'cram', label: 'CRAM' },
      { id: 'fastq', label: 'FASTQ' },
      { id: 'idat', label: 'IDAT' },
      { id: 'vcf', label: 'VCF' },
      { id: 'mzml', label: 'mzML' },
      { id: 'processed_counts', label: 'processed counts (CSV)' },
    ],
  },
  {
    id: 'isMultiSpecimen',
    label: 'Is Multi-Specimen',
    kind: 'boolean',
  },
  // Placeholder: not in the ELITE-47 spec — exists to exercise the text
  // kind (contains / starts with / …). Swap for a real free-text field
  // when the data source has one.
  {
    id: 'fileName',
    label: 'File Name',
    kind: 'text',
  },
  // Placeholder: not in the ELITE-47 spec — mirrors the "File Size Bytes"
  // column at susheelvarma.com/cohort-builder/'s Data files table.
  {
    id: 'fileSizeBytes',
    label: 'File Size (Bytes)',
    kind: 'range',
  },

  // ── Assessment Availability ─────────────────────────────────────────
  {
    id: 'hasBiomarkerData',
    label: 'Has Biomarker Data',
    kind: 'boolean',
  },
  {
    id: 'hasFunctionalAssessment',
    label: 'Has Functional Assessment',
    kind: 'boolean',
  },
  {
    id: 'hasAnthropometrics',
    label: 'Has Anthropometrics',
    kind: 'boolean',
  },
  {
    id: 'hasCognitiveAssessment',
    label: 'Has Cognitive Assessment',
    kind: 'enum',
    ordered: false,
    values: [
      { id: 'mmse', label: 'MMSE' },
      { id: 'moca', label: 'MoCA' },
      { id: 'cdr', label: 'CDR' },
      { id: 'cognitive_score', label: 'CognitiveScore' },
      { id: 'casi', label: 'CASI' },
      { id: 'digit_span', label: 'DigitSpan' },
      { id: 'logical_memory', label: 'LogicalMemory' },
      { id: 'category_fluency', label: 'CategoryFluency' },
    ],
  },

  // ── Genetic Stratification ──────────────────────────────────────────
  {
    id: 'apoeGenotype',
    label: 'APOE Genotype',
    kind: 'enum',
    ordered: true,
    values: [
      { id: 'e2_e2', label: 'e2/e2' },
      { id: 'e2_e3', label: 'e2/e3' },
      { id: 'e2_e4', label: 'e2/e4' },
      { id: 'e3_e3', label: 'e3/e3' },
      { id: 'e3_e4', label: 'e3/e4' },
      { id: 'e4_e4', label: 'e4/e4' },
    ],
  },

  // ── Comorbidity ─────────────────────────────────────────────────────
  { id: 'hasCVD', label: 'Has CVD', kind: 'boolean' },
  { id: 'hasDementia', label: 'Has Dementia', kind: 'boolean' },
  { id: 'hasDiabetes', label: 'Has Diabetes', kind: 'boolean' },
  { id: 'hasParkinsons', label: "Has Parkinson's", kind: 'boolean' },
  { id: 'hasPeripheralArteryDisease', label: 'Has Peripheral Artery Disease', kind: 'boolean' },
  { id: 'hasAtrialFibrillation', label: 'Has Atrial Fibrillation', kind: 'boolean' },
  { id: 'hasAnxiety', label: 'Has Anxiety', kind: 'boolean' },
  { id: 'hasArthritis', label: 'Has Arthritis', kind: 'boolean' },
  { id: 'hasAsthma', label: 'Has Asthma', kind: 'boolean' },
  { id: 'hasCABG', label: 'Has CABG', kind: 'boolean' },
  { id: 'hasTIA', label: 'Has TIA', kind: 'boolean' },
  { id: 'hasCancer', label: 'Has Cancer', kind: 'boolean' },
  { id: 'hasDVT', label: 'Has DVT', kind: 'boolean' },
  { id: 'hasCHF', label: 'Has CHF', kind: 'boolean' },
  { id: 'hasDepression', label: 'Has Depression', kind: 'boolean' },
  { id: 'hasCOPD', label: 'Has COPD', kind: 'boolean' },
  { id: 'hasGlaucoma', label: 'Has Glaucoma', kind: 'boolean' },
  { id: 'hasMI', label: 'Has MI', kind: 'boolean' },
  { id: 'hasOsteoporosis', label: 'Has Osteoporosis', kind: 'boolean' },
  { id: 'hasStroke', label: 'Has Stroke', kind: 'boolean' },
]

/** Look up a property by id. Returns `undefined` if unknown. */
export function getProperty(id: string): Property | undefined {
  return PROPERTIES.find((p) => p.id === id)
}
