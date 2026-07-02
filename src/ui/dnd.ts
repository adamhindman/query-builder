/**
 * Cross-component drag channel between the sidebar (drag source) and the
 * query tree (drop target).
 *
 * The two sides are separate components that shouldn't reach into each
 * other's internals — in a future React port they'll be separate components,
 * and this module becomes a context/shared store. It exists because HTML5
 * DnD only exposes the dataTransfer payload on `drop`; during `dragover`,
 * where drop zones must already decide whether to accept, the payload is
 * unreadable — so the in-flight property id is tracked here instead.
 *
 * (The tree's own node-reorder drag state stays private to the render
 * module — it never crosses a component boundary.)
 */

let propertyId: string | null = null

export function startPropertyDrag(id: string): void {
  propertyId = id
}

export function endPropertyDrag(): void {
  propertyId = null
}

/** The property id being dragged from the sidebar, or null. */
export function draggedPropertyId(): string | null {
  return propertyId
}
