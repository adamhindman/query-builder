/**
 * Schema for the queryable dataset.
 *
 * A `Property` is something you can filter on. Its `kind` determines the
 * input UI and how a condition stores its value:
 *   - 'enum'    → fixed set of values, multi-selected via toggle pills, with
 *                 an any/all/none operator
 *   - 'boolean' → Yes/No pill pair (no operator)
 *   - 'range'   → two number inputs, min and max (no operator)
 *   - 'minimum' → "at least" + a dropdown of thresholds, e.g. 1+…4+
 *                 (no operator)
 */

export type PropertyValue = {
  /** Stable machine id, unique within its property. */
  id: string
  /** Human-facing label shown in the UI. */
  label: string
}

type PropertyBase = {
  /** Stable machine id, unique across the schema. */
  id: string
  /** Human-facing label shown in the property dropdown. */
  label: string
}

export type EnumProperty = PropertyBase & {
  kind: 'enum'
  /**
   * Whether values have a meaningful order (e.g. size, age). Currently inert
   * metadata — carried for a future range-style operator on ordered enums.
   */
  ordered: boolean
  values: PropertyValue[]
}

export type BooleanProperty = PropertyBase & {
  kind: 'boolean'
}

export type RangeProperty = PropertyBase & {
  kind: 'range'
  /** Unit label shown after the inputs (e.g. "kg"). */
  unit?: string
}

export type MinimumProperty = PropertyBase & {
  kind: 'minimum'
  /** Selectable thresholds; each renders as "N+". */
  options: number[]
}

export type Property = EnumProperty | BooleanProperty | RangeProperty | MinimumProperty
