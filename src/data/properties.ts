import type { Property } from './schema'

/**
 * Mock dataset: a menagerie of animals.
 *
 * Just the queryable properties and their possible values — production won't
 * expose per-option match counts, so none are stored here.
 */
export const PROPERTIES: Property[] = [
  {
    id: 'class',
    label: 'Class',
    ordered: false,
    values: [
      { id: 'mammal', label: 'Mammal' },
      { id: 'bird', label: 'Bird' },
      { id: 'reptile', label: 'Reptile' },
      { id: 'amphibian', label: 'Amphibian' },
      { id: 'fish', label: 'Fish' },
      { id: 'insect', label: 'Insect' },
    ],
  },
  {
    id: 'habitat',
    label: 'Habitat',
    ordered: false,
    values: [
      { id: 'forest', label: 'Forest' },
      { id: 'rainforest', label: 'Rainforest' },
      { id: 'grassland', label: 'Grassland' },
      { id: 'desert', label: 'Desert' },
      { id: 'wetland', label: 'Wetland' },
      { id: 'ocean', label: 'Ocean' },
      { id: 'freshwater', label: 'Freshwater' },
      { id: 'arctic', label: 'Arctic & Tundra' },
      { id: 'mountain', label: 'Mountain' },
    ],
  },
  {
    id: 'diet',
    label: 'Diet',
    ordered: false,
    values: [
      { id: 'herbivore', label: 'Herbivore' },
      { id: 'carnivore', label: 'Carnivore' },
      { id: 'omnivore', label: 'Omnivore' },
      { id: 'insectivore', label: 'Insectivore' },
      { id: 'filter_feeder', label: 'Filter feeder' },
    ],
  },
  {
    id: 'conservation',
    label: 'Conservation status',
    ordered: true,
    values: [
      { id: 'lc', label: 'Least concern' },
      { id: 'nt', label: 'Near threatened' },
      { id: 'vu', label: 'Vulnerable' },
      { id: 'en', label: 'Endangered' },
      { id: 'cr', label: 'Critically endangered' },
      { id: 'ew', label: 'Extinct in the wild' },
    ],
  },
  {
    id: 'size',
    label: 'Size',
    ordered: true,
    values: [
      { id: 'tiny', label: 'Tiny (< 10 cm)' },
      { id: 'small', label: 'Small (10–50 cm)' },
      { id: 'medium', label: 'Medium (0.5–1.5 m)' },
      { id: 'large', label: 'Large (1.5–4 m)' },
      { id: 'huge', label: 'Huge (> 4 m)' },
    ],
  },
  {
    id: 'activity',
    label: 'Activity pattern',
    ordered: false,
    values: [
      { id: 'diurnal', label: 'Diurnal' },
      { id: 'nocturnal', label: 'Nocturnal' },
      { id: 'crepuscular', label: 'Crepuscular' },
      { id: 'cathemeral', label: 'Cathemeral' },
    ],
  },
  {
    id: 'continent',
    label: 'Continent',
    ordered: false,
    values: [
      { id: 'africa', label: 'Africa' },
      { id: 'asia', label: 'Asia' },
      { id: 'europe', label: 'Europe' },
      { id: 'north_america', label: 'North America' },
      { id: 'south_america', label: 'South America' },
      { id: 'oceania', label: 'Oceania' },
      { id: 'antarctica', label: 'Antarctica' },
    ],
  },
  {
    id: 'legs',
    label: 'Number of legs',
    ordered: true,
    values: [
      { id: '0', label: '0 (legless)' },
      { id: '2', label: '2' },
      { id: '4', label: '4' },
      { id: '6', label: '6' },
      { id: '8', label: '8' },
    ],
  },
  {
    id: 'lifespan',
    label: 'Lifespan',
    ordered: true,
    values: [
      { id: 'lt1', label: 'Under 1 year' },
      { id: '1_5', label: '1–5 years' },
      { id: '5_15', label: '5–15 years' },
      { id: '15_30', label: '15–30 years' },
      { id: '30plus', label: '30+ years' },
    ],
  },
  {
    // Deliberately large value set — stress-tests how the UI handles a
    // property with many options.
    id: 'order',
    label: 'Taxonomic order',
    ordered: false,
    values: [
      { id: 'carnivora', label: 'Carnivora' },
      { id: 'primates', label: 'Primates' },
      { id: 'rodentia', label: 'Rodentia' },
      { id: 'chiroptera', label: 'Chiroptera' },
      { id: 'cetacea', label: 'Cetacea' },
      { id: 'artiodactyla', label: 'Artiodactyla' },
      { id: 'perissodactyla', label: 'Perissodactyla' },
      { id: 'proboscidea', label: 'Proboscidea' },
      { id: 'marsupialia', label: 'Marsupialia' },
      { id: 'monotremata', label: 'Monotremata' },
      { id: 'passeriformes', label: 'Passeriformes' },
      { id: 'falconiformes', label: 'Falconiformes' },
      { id: 'strigiformes', label: 'Strigiformes' },
      { id: 'psittaciformes', label: 'Psittaciformes' },
      { id: 'sphenisciformes', label: 'Sphenisciformes' },
      { id: 'anseriformes', label: 'Anseriformes' },
      { id: 'squamata', label: 'Squamata' },
      { id: 'testudines', label: 'Testudines' },
      { id: 'crocodilia', label: 'Crocodilia' },
      { id: 'anura', label: 'Anura' },
      { id: 'caudata', label: 'Caudata' },
      { id: 'coleoptera', label: 'Coleoptera' },
      { id: 'lepidoptera', label: 'Lepidoptera' },
      { id: 'hymenoptera', label: 'Hymenoptera' },
      { id: 'odonata', label: 'Odonata' },
      { id: 'orthoptera', label: 'Orthoptera' },
      { id: 'araneae', label: 'Araneae' },
      { id: 'decapoda', label: 'Decapoda' },
      { id: 'octopoda', label: 'Octopoda' },
      { id: 'perciformes', label: 'Perciformes' },
    ],
  },
]

/** Look up a property by id. Returns `undefined` if unknown. */
export function getProperty(id: string): Property | undefined {
  return PROPERTIES.find((p) => p.id === id)
}
