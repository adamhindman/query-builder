/**
 * Shared privacy-rounding rules for any count shown in the UI — the total
 * match count (main.ts) and the characterization bar charts
 * (ui/characterizations.ts) both use this, so a count is never surfaced
 * exactly anywhere in the app for the same reason. Mirrors the "count
 * threshold gate" in the Cohort Builder 2.0 backend design doc.
 */

/** A cohort smaller than this risks re-identifying someone. */
export const SUPPRESSION_THRESHOLD = 20

/** True for a non-zero count small enough to withhold entirely (0 itself is
    fine — it just means nobody matches, nothing to protect). */
export function isBelowThreshold(n: number): boolean {
  return n > 0 && n < SUPPRESSION_THRESHOLD
}

/** Display string for a count: exact "0", "<20" when suppressed, otherwise
    "≈" + rounded to the nearest 10. Never an exact non-zero number. */
export function approximateCount(n: number): string {
  if (n === 0) return '0'
  if (isBelowThreshold(n)) return `<${SUPPRESSION_THRESHOLD}`
  return `≈${(Math.round(n / 10) * 10).toLocaleString()}`
}

/** Numeric counterpart for chart bar lengths (Plotly needs a number, not a
    label) — same buckets: 0 stays 0, a suppressed count clamps to the
    threshold, everything else rounds to the nearest 10. */
export function approximateCountValue(n: number): number {
  if (n === 0) return 0
  if (isBelowThreshold(n)) return SUPPRESSION_THRESHOLD
  return Math.round(n / 10) * 10
}
