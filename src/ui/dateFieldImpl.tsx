import { useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DateField } from '@mui/x-date-pickers/DateField'
import dayjs, { type Dayjs } from 'dayjs'

/**
 * The actual React/MUI implementation — lazy-loaded (see `dateField.ts`), so
 * react/react-dom/MUI/dayjs are only fetched the first time a date
 * condition's field is actually rendered, the same reasoning
 * `ui/characterizations.ts` lazy-loads Plotly for.
 *
 * `DateField` is used **uncontrolled** (`defaultValue`): the rest of the app
 * commits number/text inputs on change/blur, never on keystroke, because
 * every store update triggers a full tree re-render (see CLAUDE.md). The
 * same rule applies here — the field's own internal state carries an
 * in-progress edit across keystrokes without touching the store; only
 * `onBlur` commits the latest parsed value.
 *
 * No `label` prop, on purpose: MUI's own placeholder-opacity logic
 * (`PickersInputBaseSectionsContainer`'s styled `variants`, in
 * `PickersInputBase.js`) only dims the empty-section placeholder text to a
 * *visible* 0.42 opacity when `inputHasLabel` is false (or true with the
 * label actually shrunk) — passing a `label` we then hide via CSS leaves
 * `inputHasLabel: true` with an unshrunk label, landing in the fully
 * invisible `opacity: 0` bucket instead. The accessible name is passed via
 * `aria-label` instead, which doesn't affect that logic at all.
 */

const ISO_FORMAT = 'YYYY-MM-DD'

function isoOrNull(value: Dayjs | null): string | null {
  return value && value.isValid() ? value.format(ISO_FORMAT) : null
}

function DateFieldControl({
  value,
  label,
  onCommit,
}: {
  value: string | null
  label: string
  onCommit: (v: string | null) => void
}) {
  // Tracks the latest parsed value across keystrokes; committed on blur only.
  const latest = useRef<Dayjs | null>(value ? dayjs(value) : null)
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DateField
        defaultValue={value ? dayjs(value) : null}
        format={ISO_FORMAT}
        size="small"
        aria-label={label}
        onChange={(next) => {
          latest.current = next
        }}
        onBlur={() => onCommit(isoOrNull(latest.current))}
      />
    </LocalizationProvider>
  )
}

/** Create a React root in `container` and render the date field into it. */
export function createDateFieldRoot(
  container: HTMLElement,
  value: string | null,
  label: string,
  onCommit: (v: string | null) => void,
): Root {
  const root = createRoot(container)
  root.render(<DateFieldControl value={value} label={label} onCommit={onCommit} />)
  return root
}
