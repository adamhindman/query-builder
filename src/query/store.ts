import type { Group } from './model'
import { defaultQuery } from './model'

/**
 * A minimal observable store holding the query tree.
 *
 * State is replaced wholesale on every edit (the model functions are pure and
 * return new trees), and subscribers are notified so the UI can re-render.
 */
type Listener = (state: Group) => void

export class QueryStore {
  private state: Group
  private listeners = new Set<Listener>()

  constructor(initial: Group = defaultQuery()) {
    this.state = initial
  }

  get(): Group {
    return this.state
  }

  /** Apply a pure transform to the tree and notify subscribers. */
  update(fn: (state: Group) => Group): void {
    const next = fn(this.state)
    if (next === this.state) return
    this.state = next
    for (const listener of this.listeners) listener(this.state)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
