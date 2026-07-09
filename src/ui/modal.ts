import { el } from '../dom'

/**
 * A minimal, single-instance confirm modal — used in place of the native
 * `window.confirm()` so the "leaving the query builder" warning matches the
 * app's own design language (DM Sans, the same button shapes/colors as the
 * rest of the UI) instead of a jarring native browser dialog.
 *
 * Only one confirm can be open at a time; a second call while one is open
 * replaces it (the first's promise resolves `false`, as if canceled).
 */

type ConfirmOptions = {
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
}

let activeResolve: ((confirmed: boolean) => void) | null = null

const backdrop = el('div', { class: 'modal-backdrop', hidden: true })
const titleEl = el('h2', { class: 'modal-title' })
const messageEl = el('p', { class: 'modal-message' })
const cancelBtn = el('button', { type: 'button', class: 'modal-btn modal-btn-cancel' })
const confirmBtn = el('button', { type: 'button', class: 'modal-btn modal-btn-confirm' })
const card = el(
  'div',
  { class: 'modal-card', role: 'alertdialog', 'aria-modal': 'true' },
  titleEl,
  messageEl,
  el('div', { class: 'modal-actions' }, cancelBtn, confirmBtn),
)
backdrop.appendChild(card)

function close(confirmed: boolean): void {
  backdrop.hidden = true
  const resolve = activeResolve
  activeResolve = null
  resolve?.(confirmed)
}

backdrop.addEventListener('click', (e) => {
  if (e.target === backdrop) close(false)
})
cancelBtn.addEventListener('click', () => close(false))
confirmBtn.addEventListener('click', () => close(true))
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !backdrop.hidden) close(false)
})

/** Show the confirm modal; resolves `true` if confirmed, `false` otherwise
    (Cancel, backdrop click, or Escape). */
export function confirmModal(opts: ConfirmOptions): Promise<boolean> {
  if (activeResolve) close(false) // replace any modal already open
  titleEl.textContent = opts.title
  messageEl.textContent = opts.message
  cancelBtn.textContent = opts.cancelLabel ?? 'Cancel'
  confirmBtn.textContent = opts.confirmLabel
  backdrop.hidden = false
  confirmBtn.focus()
  return new Promise((resolve) => {
    activeResolve = resolve
  })
}

/** Mount point — appended once to the document by the caller (main.ts). */
export function modalRoot(): HTMLElement {
  return backdrop
}

/**
 * A second, single-instance **info** modal (a title, arbitrary body content,
 * one "Got it" button) — separate from the confirm modal above since its
 * shape is different (no Cancel/Confirm choice, just dismiss), but it reuses
 * the same `.modal-*` CSS so the two read as one family.
 */

const helpBackdrop = el('div', { class: 'modal-backdrop', hidden: true })
const helpTitleEl = el('h2', { class: 'modal-title' })
const helpBodyEl = el('div', { class: 'modal-message' })
const helpCloseBtn = el('button', { type: 'button', class: 'modal-btn modal-btn-cancel' }, 'Got it')
const helpCard = el(
  'div',
  { class: 'modal-card', role: 'dialog', 'aria-modal': 'true' },
  helpTitleEl,
  helpBodyEl,
  el('div', { class: 'modal-actions' }, helpCloseBtn),
)
helpBackdrop.appendChild(helpCard)

function closeHelp(): void {
  helpBackdrop.hidden = true
}

helpBackdrop.addEventListener('click', (e) => {
  if (e.target === helpBackdrop) closeHelp()
})
helpCloseBtn.addEventListener('click', closeHelp)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !helpBackdrop.hidden) closeHelp()
})

/** Show an info modal with a title and arbitrary body content. */
export function infoModal(title: string, body: HTMLElement): void {
  helpTitleEl.textContent = title
  helpBodyEl.replaceChildren(body)
  helpBackdrop.hidden = false
  helpCloseBtn.focus()
}

/** Mount point for the info modal — appended once by the caller (main.ts). */
export function infoModalRoot(): HTMLElement {
  return helpBackdrop
}
