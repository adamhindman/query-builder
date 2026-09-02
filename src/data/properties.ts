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
 * Each property carries a `category` (Demographic & Clinical, Study & Cohort
 * Design, Biospecimen, Data Modality, Assessment Availability, Genetic
 * Stratification, Comorbidity). `PROPERTIES`'s own order matches those
 * groupings — the section comments below mark the same boundaries the
 * `category` field encodes, kept for readability.
 */
export const PROPERTIES: Property[] = [
  // ── Demographic & Clinical ──────────────────────────────────────────
  {
    id: 'age',
    label: 'Age',
    category: 'Demographic & Clinical',
    kind: 'range',
    unit: 'years',
  },
  {
    id: 'sex',
    label: 'Sex',
    category: 'Demographic & Clinical',
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
    category: 'Demographic & Clinical',
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
    category: 'Demographic & Clinical',
    kind: 'boolean',
  },
  {
    id: 'race',
    label: 'Race',
    category: 'Demographic & Clinical',
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
    category: 'Demographic & Clinical',
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
    category: 'Demographic & Clinical',
    kind: 'boolean',
  },
  {
    id: 'yearsOfEducation',
    label: 'Years of Education',
    category: 'Demographic & Clinical',
    kind: 'boolean',
  },

  // ── Study & Cohort Design ───────────────────────────────────────────
  {
    id: 'cohort',
    label: 'Cohort',
    category: 'Study & Cohort Design',
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
    id: 'studyKey',
    label: 'Study Key',
    category: 'Study & Cohort Design',
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
    category: 'Study & Cohort Design',
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
    category: 'Study & Cohort Design',
    kind: 'enum',
    ordered: false,
    values: [
      { id: 'forsyth_county', label: 'Forsyth County' },
      { id: 'jackson', label: 'Jackson' },
      { id: 'minneapolis', label: 'Minneapolis' },
      { id: 'washington_county', label: 'Washington County' },
      { id: 'pittsburgh', label: 'Pittsburgh' },
      { id: 'sacramento', label: 'Sacramento' },
      { id: 'hagerstown', label: 'Hagerstown' },
      { id: 'bronx', label: 'Bronx' },
      { id: 'baltimore', label: 'Baltimore' },
      { id: 'winston_salem', label: 'Winston-Salem' },
      { id: 'new_york', label: 'New York' },
      { id: 'boston', label: 'Boston' },
    ],
  },
  {
    id: 'visitCode',
    label: 'Visit Code',
    category: 'Study & Cohort Design',
    kind: 'range',
    description: 'Which numbered study visit the specimen was collected at.',
  },
  {
    id: 'enrollmentDate',
    label: 'Enrollment Date',
    category: 'Study & Cohort Design',
    kind: 'date',
  },
  {
    id: 'familyStudyParticipant',
    label: 'Family Study Participant',
    category: 'Study & Cohort Design',
    kind: 'boolean',
  },
  {
    id: 'hasMZTwinData',
    label: 'Has MZ Twin Data',
    category: 'Study & Cohort Design',
    kind: 'boolean',
  },

  // ── Biospecimen ─────────────────────────────────────────────────────
  // Specimen-level fields: what physical material a file's data was
  // generated from. Unlike most of the properties above, these are
  // genuinely file/specimen-level, not participant-level.
  {
    id: 'specimenType',
    label: 'Specimen Type',
    category: 'Biospecimen',
    kind: 'enum',
    ordered: false,
    description: "The type of biological specimen the file's data was derived from (e.g. whole blood, CSF).",
    values: [
      { id: 'whole_blood', label: 'Whole Blood' },
      { id: 'plasma', label: 'Plasma' },
      { id: 'serum', label: 'Serum' },
      { id: 'pbmc', label: 'PBMC' },
      { id: 'buffy_coat', label: 'Buffy Coat' },
      { id: 'csf', label: 'CSF' },
      { id: 'saliva', label: 'Saliva' },
      { id: 'urine', label: 'Urine' },
      { id: 'frozen_tissue', label: 'Frozen Tissue' },
      { id: 'ffpe_tissue', label: 'FFPE Tissue' },
      { id: 'dna', label: 'DNA' },
      { id: 'rna', label: 'RNA' },
    ],
  },
  {
    id: 'organ',
    label: 'Organ',
    category: 'Biospecimen',
    kind: 'enum',
    ordered: false,
    description: 'The organ the specimen was collected from.',
    values: [
      { id: 'brain', label: 'Brain' },
      { id: 'blood', label: 'Blood' },
      { id: 'skin', label: 'Skin' },
      { id: 'skeletal_muscle', label: 'Skeletal Muscle' },
      { id: 'adipose', label: 'Adipose Tissue' },
      { id: 'liver', label: 'Liver' },
      { id: 'heart', label: 'Heart' },
      { id: 'kidney', label: 'Kidney' },
    ],
  },
  {
    id: 'tissue',
    label: 'Tissue',
    category: 'Biospecimen',
    kind: 'enum',
    ordered: false,
    description: 'The specific tissue or anatomical region the specimen was collected from.',
    values: [
      { id: 'frontal_cortex', label: 'Frontal Cortex' },
      { id: 'temporal_cortex', label: 'Temporal Cortex' },
      { id: 'hippocampus', label: 'Hippocampus' },
      { id: 'cerebellum', label: 'Cerebellum' },
      { id: 'substantia_nigra', label: 'Substantia Nigra' },
      { id: 'whole_blood_tissue', label: 'Whole Blood' },
      { id: 'skin_tissue', label: 'Skin' },
      { id: 'skeletal_muscle_tissue', label: 'Skeletal Muscle' },
    ],
  },
  {
    id: 'nucleicAcidSource',
    label: 'Nucleic Acid Source',
    category: 'Biospecimen',
    kind: 'enum',
    ordered: false,
    description: 'The source material nucleic acids were extracted from for sequencing.',
    values: [
      { id: 'whole_blood_source', label: 'Whole Blood' },
      { id: 'pbmc_source', label: 'PBMC' },
      { id: 'buffy_coat_source', label: 'Buffy Coat' },
      { id: 'saliva_source', label: 'Saliva' },
      { id: 'cell_line', label: 'Cell Line' },
      { id: 'fibroblast_source', label: 'Fibroblast' },
      { id: 'postmortem_brain', label: 'Postmortem Brain Tissue' },
      { id: 'ffpe_source', label: 'FFPE Tissue' },
    ],
  },
  {
    id: 'cellType',
    label: 'Cell Type',
    category: 'Biospecimen',
    kind: 'enum',
    ordered: false,
    description: "The cell type profiled or sorted for this file's data.",
    values: [
      { id: 'neuron', label: 'Neuron' },
      { id: 'astrocyte', label: 'Astrocyte' },
      { id: 'microglia', label: 'Microglia' },
      { id: 'oligodendrocyte', label: 'Oligodendrocyte' },
      { id: 'endothelial_cell', label: 'Endothelial Cell' },
      { id: 'pbmc_cell', label: 'PBMC' },
      { id: 'fibroblast_cell', label: 'Fibroblast' },
      { id: 'ipsc_neuron', label: 'iPSC-Derived Neuron' },
    ],
  },
  {
    id: 'isPostMortem',
    label: 'Is Post-Mortem',
    category: 'Biospecimen',
    kind: 'boolean',
  },

  // ── Data Modality ───────────────────────────────────────────────────
  {
    id: 'dataType',
    label: 'Data Type',
    category: 'Data Modality',
    kind: 'enum',
    ordered: false,
    description: 'The category of biological data contained in the file (e.g. gene expression, variant calls).',
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
    category: 'Data Modality',
    kind: 'enum',
    ordered: false,
    description: "The experimental method used to generate the file's data.",
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
    category: 'Data Modality',
    kind: 'enum',
    ordered: false,
    description: "The file's storage format (e.g. BAM, VCF, CSV).",
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
    category: 'Data Modality',
    kind: 'boolean',
    description: 'Whether the file contains data from more than one specimen.',
  },
  // Placeholder: not in the ELITE-47 spec — how many participants' data is
  // pooled into this file (e.g. a multi-sample VCF). Randomly assigned in
  // `data/records.ts`, skewed toward single-participant files.
  {
    id: 'participantCount',
    label: 'Participant Count',
    category: 'Data Modality',
    kind: 'range',
    description: "How many participants' data is included in this file.",
  },
  // Placeholder: not in the ELITE-47 spec — whether this file is part of a
  // curated dataset (vs. a standalone file); the Results table's "Dataset"
  // column shows it. Randomly assigned in `data/records.ts`.
  {
    id: 'isPartOfDataset',
    label: 'Part of Dataset',
    category: 'Data Modality',
    kind: 'boolean',
    description: 'Whether the file is part of a curated dataset, rather than a standalone upload.',
  },
  // Placeholder: not in the ELITE-47 spec — exists to exercise the text
  // kind (contains / starts with / …). Swap for a real free-text field
  // when the data source has one.
  {
    id: 'fileName',
    label: 'File Name',
    category: 'Data Modality',
    kind: 'text',
    description: 'The name of the data file.',
  },
  // Placeholder: not in the ELITE-47 spec — mirrors the "File Size Bytes"
  // column at susheelvarma.com/cohort-builder/'s Data files table.
  {
    id: 'fileSizeBytes',
    label: 'File Size (Bytes)',
    category: 'Data Modality',
    kind: 'range',
    description: "The file's size, in bytes.",
  },

  // ── Assessment Availability ─────────────────────────────────────────
  {
    id: 'hasBiomarkerData',
    label: 'Has Biomarker Data',
    category: 'Assessment Availability',
    kind: 'boolean',
  },
  {
    id: 'hasFunctionalAssessment',
    label: 'Has Functional Assessment',
    category: 'Assessment Availability',
    kind: 'boolean',
  },
  {
    id: 'hasAnthropometrics',
    label: 'Has Anthropometrics',
    category: 'Assessment Availability',
    kind: 'boolean',
  },
  {
    id: 'hasCognitiveAssessment',
    label: 'Has Cognitive Assessment',
    category: 'Assessment Availability',
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
    category: 'Genetic Stratification',
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
  { id: 'hasCVD', label: 'Has CVD', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasDementia', label: 'Has Dementia', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasDiabetes', label: 'Has Diabetes', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasParkinsons', label: "Has Parkinson's", category: 'Comorbidity', kind: 'boolean' },
  {
    id: 'hasPeripheralArteryDisease',
    label: 'Has Peripheral Artery Disease',
    category: 'Comorbidity',
    kind: 'boolean',
  },
  { id: 'hasAtrialFibrillation', label: 'Has Atrial Fibrillation', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasAnxiety', label: 'Has Anxiety', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasArthritis', label: 'Has Arthritis', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasAsthma', label: 'Has Asthma', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasCABG', label: 'Has CABG', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasTIA', label: 'Has TIA', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasCancer', label: 'Has Cancer', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasDVT', label: 'Has DVT', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasCHF', label: 'Has CHF', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasDepression', label: 'Has Depression', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasCOPD', label: 'Has COPD', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasGlaucoma', label: 'Has Glaucoma', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasMI', label: 'Has MI', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasOsteoporosis', label: 'Has Osteoporosis', category: 'Comorbidity', kind: 'boolean' },
  { id: 'hasStroke', label: 'Has Stroke', category: 'Comorbidity', kind: 'boolean' },
]

/** Look up a property by id. Returns `undefined` if unknown. */
export function getProperty(id: string): Property | undefined {
  return PROPERTIES.find((p) => p.id === id)
}
