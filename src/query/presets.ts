import type { Condition, ConditionOp, Group, Node } from './model'
import { newCondition, newGroup, newQuery } from './model'

/**
 * Ready-made queries for exercising every feature of the builder. Each is
 * built fresh from the model factories (so ids stay unique) and then has its
 * fields filled in.
 */

function cond(propertyId: string, op: ConditionOp, valueIds: string[]): Condition {
  return { ...newCondition(), propertyId, op, valueIds }
}

function boolCond(propertyId: string, value: boolean): Condition {
  return { ...newCondition(), propertyId, bool: value }
}

function rangeCond(propertyId: string, min: number | null, max: number | null): Condition {
  return { ...newCondition(), propertyId, range: { min, max } }
}

function minCond(propertyId: string, minimum: number): Condition {
  return { ...newCondition(), propertyId, minimum }
}

function group(
  combinator: Group['combinator'],
  exclude: boolean,
  children: Node[],
): Group {
  return { ...newGroup(combinator), exclude, children }
}

export type Preset = {
  id: string
  label: string
  build: () => Group
}

// Presets use only fully-defined fields (age enum, booleans, range, minimum) —
// the multiselect fields have no option values yet (see properties.ts TODOs).
export const PRESETS: Preset[] = [
  {
    id: 'empty',
    label: 'No conditions',
    build: () => newQuery(),
  },
  {
    id: 'multiple-conditions',
    label: 'Multiple conditions',
    build: () =>
      group('AND', false, [
        cond('age', 'any', ['85_89', '90plus']),
        boolCond('hasDementia', true),
        boolCond('mortalityStatus', false),
      ]),
  },
  {
    id: 'conditions-and-groups',
    label: 'Conditions + multiple groups',
    build: () =>
      group('AND', false, [
        cond('age', 'any', ['80_84', '85_89', '90plus']),
        group('AND', false, [
          boolCond('hasCVD', true),
          boolCond('hasDiabetes', true),
        ]),
        group('AND', false, [minCond('visitCode', 2)]),
      ]),
  },
  {
    id: 'mixed-and-or',
    label: 'Mix of AND / OR groups',
    build: () =>
      group('AND', false, [
        boolCond('hasBiomarkerData', true),
        group('OR', false, [
          boolCond('hasDiabetes', true),
          boolCond('hasCVD', true),
        ]),
        group('AND', false, [
          cond('age', 'any', ['85_89', '90plus']),
          group('OR', false, [
            boolCond('hasStroke', true),
            boolCond('hasTIA', true),
          ]),
        ]),
      ]),
  },
  {
    id: 'input-types',
    label: 'Other input types',
    build: () =>
      group('AND', false, [
        boolCond('hasDementia', true), // boolean: Yes/No pills
        rangeCond('fieldCenterCode', 1, 20), // range: two number inputs
        minCond('visitCode', 2), // minimum: "at least" + N+ dropdown
        cond('age', 'any', ['75_79', '80_84']), // enum, for contrast
      ]),
  },
  {
    id: 'exclusions',
    label: 'Excluded group',
    build: () =>
      group('AND', false, [
        cond('age', 'any', ['85_89', '90plus']),
        group('OR', true, [
          // excluded group (NOT)
          boolCond('hasCancer', true),
          boolCond('hasDementia', true),
        ]),
      ]),
  },
]

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}
