import { Dialog } from './Dialog'
import { useApp } from './store'

export type SetKind = 'example' | 'empty'
const KINDS: SetKind[] = ['example', 'empty']

interface Props {
  open: boolean
  onClose: () => void
  onPick: (kind: SetKind) => void
}

export function NewSetDialog({ open, onClose, onPick }: Props) {
  const { t } = useApp()
  return (
    <Dialog open={open} title={t.newSet} onClose={onClose} wide>
      <p className="muted">{t.newSetText}</p>
      <div className="presets">
        {KINDS.map((kind) => (
          <div key={kind} className="preset">
            <h3>{t.presets[kind]}</h3>
            <p className="preset-events">{t.presetText[kind]}</p>
            <button className="btn" onClick={() => onPick(kind)}>
              {t.useSet}
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
