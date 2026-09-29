import { useApp } from './store'

const SILENT = '\u0000silent'
const MISSING = '\u0000missing'

interface Props {
  caption: string
  /** Bound event id; null or undefined is silent */
  file: string | null | undefined
  onChange: (file: string | null) => void
}

/** Picks the event one trigger of an element plays, or silence. */
export function TriggerSelect({ caption, file, onChange }: Props) {
  const { state, t } = useApp()
  const found = file ? state.events.some((e) => e.file === file) : false
  const status = !file ? 'silent' : found ? 'event' : 'missing'
  const value = status === 'event' ? (file as string) : status === 'silent' ? SILENT : MISSING

  return (
    <label className={`field trigger is-${status}`}>
      <span>{caption}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value === SILENT ? null : e.target.value)}
      >
        {status === 'missing' && (
          <option value={MISSING} disabled>
            {file} — {t.noEvent}
          </option>
        )}
        {state.events.map((event) => (
          <option key={event.key} value={event.file}>
            {event.file} · {event.name}
          </option>
        ))}
        <option value={SILENT}>{t.silent}</option>
      </select>
    </label>
  )
}
