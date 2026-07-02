/**
 * Schema for the queryable dataset.
 *
 * A `Property` is something you can filter on (e.g. "Class", "Habitat").
 * Each property has a fixed set of `PropertyValue`s the user can select.
 */

export type PropertyValue = {
  /** Stable machine id, unique within its property. */
  id: string
  /** Human-facing label shown in the UI. */
  label: string
}

export type Property = {
  /** Stable machine id, unique across the schema. */
  id: string
  /** Human-facing label shown in the property dropdown. */
  label: string
  /**
   * Whether values have a meaningful order (e.g. size, age).
   * Ordered properties read naturally as "is in"; unordered ones as
   * "is any of". Purely cosmetic — it only affects the operator wording.
   */
  ordered: boolean
  values: PropertyValue[]
}
