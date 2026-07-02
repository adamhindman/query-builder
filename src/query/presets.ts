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
        cond('class', 'any', ['mammal', 'bird']),
        cond('habitat', 'any', ['forest', 'rainforest', 'wetland']),
        cond('diet', 'none', ['filter_feeder']),
      ]),
  },
  {
    id: 'conditions-and-groups',
    label: 'Conditions + multiple groups',
    build: () =>
      group('AND', false, [
        cond('class', 'any', ['mammal', 'reptile']),
        group('AND', false, [
          cond('habitat', 'any', ['desert', 'grassland']),
          cond('size', 'any', ['large', 'huge']),
        ]),
        group('AND', false, [
          cond('conservation', 'any', ['vu', 'en', 'cr']),
        ]),
      ]),
  },
  {
    id: 'mixed-and-or',
    label: 'Mix of AND / OR groups',
    build: () =>
      group('AND', false, [
        cond('continent', 'any', ['africa']),
        group('OR', false, [
          cond('diet', 'any', ['carnivore']),
          cond('diet', 'any', ['omnivore']),
        ]),
        group('AND', false, [
          cond('activity', 'any', ['nocturnal']),
          group('OR', false, [
            cond('size', 'any', ['large']),
            cond('size', 'any', ['huge']),
          ]),
        ]),
      ]),
  },
  {
    id: 'exclusions',
    label: 'Excluded group',
    build: () =>
      group('AND', false, [
        cond('class', 'any', ['mammal']),
        cond('habitat', 'none', ['ocean', 'freshwater']), // exclusion via "is none of"
        group('OR', true, [
          // excluded group (NOT)
          cond('conservation', 'any', ['ew']),
          cond('continent', 'any', ['antarctica']),
        ]),
      ]),
  },
]

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}
