/**
 * The query tree.
 *
 * A query is a single root `Group`. A group combines its children with one
 * `Combinator` (AND / OR) and may be marked `exclude` (NOT). Children are an
 * ordered list of `Node`s — either leaf `Condition`s or nested `Group`s, to
 * any depth.
 *
 * A `Condition` filters on one property via an operator. Every property kind
 * has its own operator set (see `KIND_OPS` in the render module); the
 * presence operators are members of every set:
 *   enum    — 'any' (at least one selected value), 'all' (every selected
 *             value), 'none' (none of the selected values)
 *   range   — 'between' | 'gt' | 'lt' | 'gte' | 'lte'
 *   boolean — 'is' (the Yes/No selection)
 *   text    — 'contains' | 'startsWith' | 'endsWith' | 'equals'
 *   any kind — 'hasValue' | 'noValue' (a presence test on the property
 *             itself; the condition needs no value)
 *
 * All tree operations below are pure: they return a new tree and never mutate
 * the input, which keeps the store's undo-friendly and re-render logic simple.
 */

import type { Property } from '../data/schema'

export type Combinator = 'AND' | 'OR'
export type EnumOp = 'any' | 'all' | 'none'
export type RangeOp = 'between' | 'gt' | 'lt' | 'gte' | 'lte'
export type TextOp = 'contains' | 'startsWith' | 'endsWith' | 'equals'
export type PresenceOp = 'hasValue' | 'noValue'
export type ConditionOp = EnumOp | RangeOp | TextOp | PresenceOp | 'is'

export type Condition = {
  kind: 'condition'
  id: string
  /** Property being filtered on, or `null` until the user picks one. */
  propertyId: string | null
  /** Operator — drawn from the property kind's operator set. */
  op: ConditionOp
  /** Selected value ids (enum properties). */
  valueIds: string[]
  /** Yes/No selection (boolean properties); null = unset. */
  bool: boolean | null
  /** Bounds (range properties): 'between' uses both; 'gt'/'gte' store their
      value in `min`, 'lt'/'lte' in `max`. */
  range: { min: number | null; max: number | null }
  /** Free-text value (text properties); null = unset. */
  text: string | null
}

/** The operator a fresh condition starts with, per property kind. */
export function defaultOpFor(kind: Property['kind']): ConditionOp {
  switch (kind) {
    case 'enum':
      return 'any'
    case 'boolean':
      return 'is'
    case 'range':
      return 'between'
    case 'text':
      return 'contains'
  }
}

export type Group = {
  kind: 'group'
  id: string
  combinator: Combinator
  exclude: boolean
  children: Node[]
}

export type Node = Condition | Group

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

let idCounter = 0
/** Monotonic, collision-free id for a freshly created node. */
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

export function newCondition(): Condition {
  return {
    kind: 'condition',
    id: nextId('c'),
    propertyId: null,
    op: 'any',
    valueIds: [],
    bool: null,
    range: { min: null, max: null },
    text: null,
  }
}

export function newGroup(combinator: Combinator = 'AND'): Group {
  return { kind: 'group', id: nextId('g'), combinator, exclude: false, children: [] }
}

/** The default query shown on load and after "Clear all": an AND group with
    one blank condition. The tree always keeps at least one condition. */
export function defaultQuery(): Group {
  return { ...newGroup('AND'), children: [newCondition()] }
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/** Total conditions in the subtree — the UI won't delete the tree's last one. */
export function countConditions(root: Node): number {
  if (root.kind === 'condition') return 1
  return root.children.reduce((n, child) => n + countConditions(child), 0)
}

/** Ids of every property referenced by a condition anywhere in the subtree. */
export function usedPropertyIds(root: Node, into: Set<string> = new Set()): Set<string> {
  if (root.kind === 'condition') {
    if (root.propertyId) into.add(root.propertyId)
  } else {
    for (const child of root.children) usedPropertyIds(child, into)
  }
  return into
}

/** Depth-first search for a node by id. */
export function findNode(root: Node, id: string): Node | undefined {
  if (root.id === id) return root
  if (root.kind === 'group') {
    for (const child of root.children) {
      const found = findNode(child, id)
      if (found) return found
    }
  }
  return undefined
}

/** Locate a node's parent group and its index within that group. */
function locate(root: Node, id: string): { parentId: string; index: number } | undefined {
  if (root.kind !== 'group') return undefined
  const index = root.children.findIndex((c) => c.id === id)
  if (index !== -1) return { parentId: root.id, index }
  for (const child of root.children) {
    const found = locate(child, id)
    if (found) return found
  }
  return undefined
}

/** True if `ancestorId` is `nodeId` or contains it — used to block invalid drops. */
export function isDescendant(root: Node, ancestorId: string, nodeId: string): boolean {
  const ancestor = findNode(root, ancestorId)
  if (!ancestor || ancestor.kind !== 'group') return ancestorId === nodeId
  return !!findNode(ancestor, nodeId)
}

// ---------------------------------------------------------------------------
// Immutable updates
//
// `mapGroups` walks the tree and rebuilds only the branch that changed, so
// callers can express edits as "transform the group/condition with this id".
// ---------------------------------------------------------------------------

/** Rebuild the tree, replacing the node with `id` by `fn(node)`. */
function update(root: Group, id: string, fn: (node: Node) => Node): Group {
  return updateNode(root, id, fn) as Group
}

function updateNode(node: Node, id: string, fn: (node: Node) => Node): Node {
  if (node.id === id) return fn(node)
  if (node.kind === 'group') {
    return { ...node, children: node.children.map((c) => updateNode(c, id, fn)) }
  }
  return node
}

export function setCombinator(root: Group, groupId: string, combinator: Combinator): Group {
  return update(root, groupId, (n) => (n.kind === 'group' ? { ...n, combinator } : n))
}

export function toggleExclude(root: Group, groupId: string): Group {
  return update(root, groupId, (n) => (n.kind === 'group' ? { ...n, exclude: !n.exclude } : n))
}

export function addChild(root: Group, groupId: string, child: Node): Group {
  return update(root, groupId, (n) =>
    n.kind === 'group' ? { ...n, children: [...n.children, child] } : n,
  )
}

/** Empty a group — remove all its conditions and nested groups. */
export function clearGroup(root: Group, groupId: string): Group {
  return update(root, groupId, (n) => (n.kind === 'group' ? { ...n, children: [] } : n))
}

export function setProperty(
  root: Group,
  condId: string,
  propertyId: string,
  op: ConditionOp,
): Group {
  // Changing property invalidates every kind of stored value, so reset all;
  // the caller supplies the new kind's default operator (the model stays
  // ignorant of the schema data).
  return update(root, condId, (n) =>
    n.kind === 'condition'
      ? {
          ...n,
          propertyId,
          op,
          valueIds: [],
          bool: null,
          range: { min: null, max: null },
          text: null,
        }
      : n,
  )
}

export function setText(root: Group, condId: string, text: string | null): Group {
  return update(root, condId, (n) => (n.kind === 'condition' ? { ...n, text } : n))
}

export function setBool(root: Group, condId: string, value: boolean | null): Group {
  return update(root, condId, (n) => (n.kind === 'condition' ? { ...n, bool: value } : n))
}

export function setRange(
  root: Group,
  condId: string,
  min: number | null,
  max: number | null,
): Group {
  return update(root, condId, (n) => (n.kind === 'condition' ? { ...n, range: { min, max } } : n))
}

export function setOp(root: Group, condId: string, op: ConditionOp): Group {
  return update(root, condId, (n) => (n.kind === 'condition' ? { ...n, op } : n))
}

export function toggleValue(root: Group, condId: string, valueId: string): Group {
  return update(root, condId, (n) => {
    if (n.kind !== 'condition') return n
    const has = n.valueIds.includes(valueId)
    return {
      ...n,
      valueIds: has ? n.valueIds.filter((v) => v !== valueId) : [...n.valueIds, valueId],
    }
  })
}

/** Remove every condition filtering on `propertyId`, anywhere in the tree.
    (Groups are kept even if emptied.) */
export function removePropertyConditions(root: Group, propertyId: string): Group {
  const strip = (g: Group): Group => ({
    ...g,
    children: g.children
      .filter((c) => !(c.kind === 'condition' && c.propertyId === propertyId))
      .map((c) => (c.kind === 'group' ? strip(c) : c)),
  })
  return strip(root)
}

/** Remove a node by id. Returns the tree unchanged if the id is the root. */
export function removeNode(root: Group, id: string): Group {
  if (root.id === id) return root
  return removeFromGroup(root, id) as Group
}

function removeFromGroup(node: Node, id: string): Node {
  if (node.kind !== 'group') return node
  return {
    ...node,
    children: node.children
      .filter((c) => c.id !== id)
      .map((c) => removeFromGroup(c, id)),
  }
}

/**
 * Move `nodeId` so it sits at `index` within the group `targetGroupId`.
 *
 * Indices refer to the target group's child list *after* the node is detached,
 * so the drop-zone indices produced during render map directly onto this call.
 * No-ops if the move would place a group inside itself or its own descendant.
 */
export function moveNode(root: Group, nodeId: string, targetGroupId: string, index: number): Group {
  if (nodeId === root.id) return root
  if (isDescendant(root, nodeId, targetGroupId)) return root // can't drop a group into itself

  const node = findNode(root, nodeId)
  if (!node) return root

  // Drop indices are computed against the tree *before* detachment. When the
  // node is being moved to a later slot within its own parent, removing it
  // shifts everything after it left by one, so compensate.
  const from = locate(root, nodeId)
  let target = index
  if (from && from.parentId === targetGroupId && from.index < index) target = index - 1

  const detached = removeNode(root, nodeId)
  return insertInto(detached, targetGroupId, node, target) as Group
}

/** Insert a new node at `index` within the group `groupId` (index clamped). */
export function insertChild(root: Group, groupId: string, index: number, child: Node): Group {
  return insertInto(root, groupId, child, index) as Group
}

function insertInto(node: Node, targetGroupId: string, toInsert: Node, index: number): Node {
  if (node.kind !== 'group') return node
  if (node.id === targetGroupId) {
    const children = [...node.children]
    const clamped = Math.max(0, Math.min(index, children.length))
    children.splice(clamped, 0, toInsert)
    return { ...node, children }
  }
  return { ...node, children: node.children.map((c) => insertInto(c, targetGroupId, toInsert, index)) }
}
