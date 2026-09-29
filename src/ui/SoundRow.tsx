import { memo } from 'react'
import { modelById } from '../core/generate'
import type { ListSound } from '../core/types'
import type { Dict } from '../i18n/en'
import { formatDuration, OWN_PACK } from './sounds'
import { Icon } from './icons'

export interface RowActions {
  play: (id: string) => void
  choose: (id: string) => void
  favorite: (id: string) => void
  remove: (id: string) => void
}

interface Props {
  sound: ListSound
  cursor: boolean
  chosen: boolean
  starred: boolean
  canChoose: boolean
  actions: RowActions
  t: Dict
}

export const SoundRow = memo(function SoundRow({
  sound,
  cursor,
  chosen,
  starred,
  canChoose,
  actions,
  t,
}: Props) {
  const on = (fn: (id: string) => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn(sound.id)
  }
  // Listening takes focus off the last button or field, so Enter then chooses this sound.
  const listen = (e: React.MouseEvent) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    on(actions.play)(e)
  }
  const classes = ['row', cursor && 'cursor', chosen && 'chosen'].filter(Boolean).join(' ')
  return (
    <div className={classes} data-sound-id={sound.id} onClick={listen}>
      <button className="play" aria-label={`${t.play} ${sound.name}`} onClick={listen}>
        <Icon name="play" size={11} />
      </button>
      <span className="row-name" title={sound.id}>
        {sound.name}
      </span>
      {sound.generated && (
        <span
          className="ai-tag"
          title={`${modelById(sound.generated.model)?.label ?? sound.generated.model}: ${sound.generated.prompt}`}
        >
          {t.aiTag}
        </span>
      )}
      <span className="row-dur">{formatDuration(sound.duration)}</span>
      {sound.pack === OWN_PACK && (
        <button
          className="x"
          title={t.deleteOwn}
          aria-label={t.deleteOwn}
          onClick={on(actions.remove)}
        >
          <Icon name="close" size={14} />
        </button>
      )}
      <button
        className={`star${starred ? ' on' : ''}`}
        title={t.favorite}
        aria-label={t.favorite}
        aria-pressed={starred}
        onClick={on(actions.favorite)}
      >
        <Icon name="star" size={15} />
      </button>
      <button
        className={`pick${chosen ? ' on' : ''}`}
        disabled={!canChoose}
        aria-label={chosen ? t.chosen : t.choose}
        onClick={on(actions.choose)}
      >
        {chosen ? <Icon name="check" size={15} /> : t.choose}
      </button>
    </div>
  )
})
