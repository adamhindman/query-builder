import type { Condition, Group, Node } from './model'
import { getProperty } from '../data/properties'

/**
 * Render the query tree as an illustrative SQL statement.
 *
 * The goal is to show the boolean structure in a second familiar notation,
 * not to target a real database: property ids stand in as column names on a
 * flat table, and enum properties are treated as scalar columns. Per kind:
 *   enum any  → col IN (…)            none → col NOT IN (…)
 *   enum all  → AND-chain of equalities (the "has every value" reading —
 *               only satisfiable where a property is multi-valued per record)
 *   boolean   → col = TRUE/FALSE
 *   range     → col BETWEEN a AND b, or > / < / >= / <= per operator
 *   minimum   → col >= n
 *   text      → col LIKE '…' (contains/starts/ends), col = '…' (equals)
 *   presence  → col IS NULL / col IS NOT NULL (any kind)
 * Unfinished conditions and empty groups render as SQL comments, mirroring
 * the plain summary's graceful partial states.
 */

const TABLE = 'participants'
const INDENT = '  '

export function toSql(root: Group): string {
  const where = groupSql(root, 1)
  return where ? `SELECT *\nFROM ${TABLE}\nWHERE ${where}` : `SELECT *\nFROM ${TABLE}`
}

/**
 * A group's children joined by its combinator, one child per line, with the
 * combinator leading each continuation line at `depth` indents. The first
 * line carries no indent — the caller places it (after WHERE, or after an
 * opening paren).
 */
function groupSql(group: Group, depth: number): string {
  if (group.children.length === 0) return ''
  const parts = group.children.map((child) => nodeSql(child, depth))
  return parts.join(`\n${INDENT.repeat(depth)}${group.combinator} `)
}

function nodeSql(node: Node, depth: number): string {
  if (node.kind === 'condition') return conditionSql(node)
  const inner = groupSql(node, depth + 1)
  const open = node.exclude ? 'NOT (' : '('
  if (!inner) return `${open}/* empty group */)`
  return `${open}\n${INDENT.repeat(depth + 1)}${inner}\n${INDENT.repeat(depth)})`
}

function conditionSql(cond: Condition): string {
  const property = cond.propertyId ? getProperty(cond.propertyId) : undefined
  if (!property) return '/* no property chosen */'
  const col = property.id

  // Presence operators are kind-independent.
  if (cond.op === 'hasValue') return `${col} IS NOT NULL`
  if (cond.op === 'noValue') return `${col} IS NULL`

  switch (property.kind) {
    case 'enum': {
      if (cond.valueIds.length === 0) return `/* ${col}: no values chosen */`
      const list = cond.valueIds.map(quote).join(', ')
      switch (cond.op) {
        case 'none':
          return `${col} NOT IN (${list})`
        case 'all':
          return cond.valueIds.length === 1
            ? `${col} = ${quote(cond.valueIds[0])}`
            : `(${cond.valueIds.map((v) => `${col} = ${quote(v)}`).join(' AND ')})`
        default:
          return `${col} IN (${list})`
      }
    }
    case 'boolean':
      return cond.bool == null ? `/* ${col}: no value */` : `${col} = ${cond.bool ? 'TRUE' : 'FALSE'}`
    case 'range': {
      const { min, max } = cond.range
      switch (cond.op) {
        case 'gt':
          return min == null ? `/* ${col}: no value */` : `${col} > ${min}`
        case 'gte':
          return min == null ? `/* ${col}: no value */` : `${col} >= ${min}`
        case 'lt':
          return max == null ? `/* ${col}: no value */` : `${col} < ${max}`
        case 'lte':
          return max == null ? `/* ${col}: no value */` : `${col} <= ${max}`
        default: // between — one-sided bounds degrade to >= / <=
          if (min == null && max == null) return `/* ${col}: no bounds */`
          if (min != null && max != null) return `${col} BETWEEN ${min} AND ${max}`
          return min != null ? `${col} >= ${min}` : `${col} <= ${max}`
      }
    }
    case 'minimum':
      return cond.minimum == null ? `/* ${col}: no value */` : `${col} >= ${cond.minimum}`
    case 'text': {
      if (cond.text == null || cond.text === '') return `/* ${col}: no value */`
      if (cond.op === 'equals') return `${col} = ${quote(cond.text)}`
      const pat = likeEscape(cond.text)
      const pattern =
        cond.op === 'startsWith' ? `${pat}%` : cond.op === 'endsWith' ? `%${pat}` : `%${pat}%`
      // ESCAPE only when the value itself contains a LIKE wildcard.
      const escape = /[\\%_]/.test(cond.text) ? ` ESCAPE '\\'` : ''
      return `${col} LIKE ${quote(pattern)}${escape}`
    }
  }
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Escape LIKE wildcards (and the escape char itself) in a literal value. */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}
