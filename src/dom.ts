/**
 * Tiny typed helper for building DOM trees without a framework.
 *
 *   el('button', { class: 'btn', onclick: () => ... }, 'Click me')
 *
 * Props are applied as follows:
 *   - `on*`      → addEventListener (e.g. `onclick`, `oninput`)
 *   - `class`    → className
 *   - `dataset`  → merged into element.dataset
 *   - `disabled`, `draggable`, `checked`, `selected`, `value` → set as properties
 *   - anything else → setAttribute
 * Children may be strings, nodes, or (nested) arrays; null/false are skipped.
 */
type Child = string | Node | null | undefined | false | Child[]

type Props = {
  class?: string
  dataset?: Record<string, string>
  [key: string]: unknown
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)

  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue
    if (key === 'class') {
      node.className = String(value)
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value as Record<string, string>)
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value as EventListener)
    } else if (key in node) {
      // Property assignment for the common interactive attributes.
      ;(node as unknown as Record<string, unknown>)[key] = value
    } else {
      node.setAttribute(key, String(value))
    }
  }

  appendChildren(node, children)
  return node
}

function appendChildren(node: HTMLElement, children: Child[]): void {
  for (const child of children) {
    if (child == null || child === false) continue
    if (Array.isArray(child)) appendChildren(node, child)
    else if (typeof child === 'string') node.appendChild(document.createTextNode(child))
    else node.appendChild(child)
  }
}

/** Remove all children of a node. */
export function clear(node: HTMLElement): void {
  node.replaceChildren()
}
