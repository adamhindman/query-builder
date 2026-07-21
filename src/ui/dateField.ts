import type { Root } from 'react-dom/client'

/**
 * Thin, always-bundled entry point for the one MUI X component in this
 * otherwise plain-DOM app (see `vite.config.ts`'s comment). The actual
 * React/MUI/dayjs code lives in `dateFieldImpl.tsx` and is fetched via a
 * dynamic `import()` — only `Root`'s *type* is referenced here, which is
 * erased at compile time, so this file itself pulls in none of that weight.
 */

// Full-teardown re-renders discard the DOM these roots are mounted into
// without an explicit unmount — tracked here so `unmountAllDateFields` (run
// once per `main.ts` render, right before the old tree is cleared) can
// unmount them properly instead of leaking/warning.
const mountedRoots = new Set<Root>()

export function unmountAllDateFields(): void {
  for (const root of mountedRoots) root.unmount()
  mountedRoots.clear()
}

let implPromise: Promise<typeof import('./dateFieldImpl')> | null = null
function loadImpl(): Promise<typeof import('./dateFieldImpl')> {
  implPromise ??= import('./dateFieldImpl')
  return implPromise
}

/**
 * Mount (or re-mount, on the next full re-render) a `DateField` into
 * `container`. Fire-and-forget from the caller's perspective (same pattern
 * as `characterizations.ts`'s `drawChart`): the container is returned
 * synchronously so `render.ts` can keep building the tree, and the `isConnected`
 * check guards against the container having already been discarded by a
 * newer render by the time the lazy import resolves.
 */
export async function mountDateField(
  container: HTMLElement,
  value: string | null,
  label: string,
  onCommit: (v: string | null) => void,
): Promise<void> {
  const { createDateFieldRoot } = await loadImpl()
  if (!container.isConnected) return
  const root = createDateFieldRoot(container, value, label, onCommit)
  mountedRoots.add(root)
}
