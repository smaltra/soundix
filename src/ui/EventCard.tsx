import { useEffect, useState, type MouseEvent } from 'react'
import { MAX_PITCH } from '../core/set'
import type { SoundEvent } from '../core/types'
import { useFlash } from './flash'
import { describeSound } from './sounds'
import { useStep } from './step'
import { useApp, useServices } from './store'
import { Icon } from './icons'

const stop = (fn: () => void) => (e: MouseEvent) => {
  e.stopPropagation()
  fn()
}

interface SliderProps {
  label: string
  value: number
  max: number
  onChange: (value: number, step: number) => void
  onCommit: (value: number) => void
}

/** A 0..max value shown in percent; onCommit fires when the thumb is let go. */
function PercentSlider({ label, value, max, onChange, onCommit }: SliderProps) {
  const percent = Math.round(value * 100)
  const { step, gesture } = useStep()
  const commit = (e: { currentTarget: HTMLInputElement }) =>
    onCommit(Number(e.currentTarget.value) / 100)
  return (
    <label className="slider">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={Math.round(max * 100)}
        value={percent}
        {...gesture}
        onChange={(e) => onChange(Number(e.target.value) / 100, step())}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <output>{percent} %</output>
    </label>
  )
}

function EventEditor({ event }: { event: SoundEvent }) {
  const { dispatch, t } = useApp()
  const [file, setFile] = useState(event.file)
  const [words, setWords] = useState(event.words.join(', '))
  const name = useStep()

  useEffect(() => setFile(event.file), [event.file])
  useEffect(() => setWords(event.words.join(', ')), [event.words])

  // Commits read the field itself: a blur can come before React re-renders the draft.
  const commitFile = (raw: string) => {
    setFile(event.file) // shows the cleaned name, or the old one if nothing changed
    dispatch({ type: 'file', key: event.key, raw })
  }
  const commitWords = (raw: string) => {
    const list = raw
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean)
    setWords(list.join(', '))
    dispatch({ type: 'update', key: event.key, patch: { words: list } })
  }
  const onBlur = (fn: (raw: string) => void) => (e: React.FocusEvent<HTMLInputElement>) =>
    fn(e.currentTarget.value)
  const onEnter = (fn: (raw: string) => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') fn(e.currentTarget.value)
  }

  return (
    <div className="editor" onClick={(e) => e.stopPropagation()}>
      <label className="field">
        <span>{t.eventName}</span>
        <input
          value={event.name}
          maxLength={60}
          {...name.field}
          onChange={(e) =>
            dispatch({
              type: 'update',
              key: event.key,
              patch: { name: e.target.value },
              step: name.step(),
            })
          }
        />
      </label>
      <label className="field">
        <span>{t.fileName}</span>
        <input
          className="mono"
          value={file}
          maxLength={40}
          spellCheck={false}
          onChange={(e) => setFile(e.target.value)}
          onBlur={onBlur(commitFile)}
          onKeyDown={onEnter(commitFile)}
        />
      </label>
      <label className="field">
        <span>{t.words}</span>
        <input
          value={words}
          spellCheck={false}
          onChange={(e) => setWords(e.target.value)}
          onBlur={onBlur(commitWords)}
          onKeyDown={onEnter(commitWords)}
        />
        <small>{t.wordsHint}</small>
      </label>
      <button
        className="btn danger small"
        onClick={() => dispatch({ type: 'remove', key: event.key })}
      >
        <Icon name="trash" size={14} />
        {t.deleteEvent}
      </button>
    </div>
  )
}

export function EventCard({ event, current }: { event: SoundEvent; current: boolean }) {
  const { dispatch, t } = useApp()
  const { library, own, player } = useServices()
  const led = useFlash<HTMLSpanElement>(event.key)
  const info = event.sound && describeSound(event.sound, library, own.list, t)
  const update = (patch: Partial<SoundEvent>, step: number) =>
    dispatch({ type: 'update', key: event.key, patch, step })
  const select = () => dispatch({ type: 'select', key: event.key })
  const play = stop(() => player.playEvent(event))
  const reason = info && !info.playable ? info.reason : undefined

  // Only the current event shows its settings; the others are one line.
  if (!current) {
    return (
      <article className="event compact" onClick={select}>
        <span className="led" ref={led} aria-hidden />
        <b className="event-name">{event.name || event.file}</b>
        {info?.playable ? (
          <>
            <span className="event-pick" title={info.id}>
              {info.name}
            </span>
            <button className="play" aria-label={`${t.play} ${event.name}`} onClick={play}>
              <Icon name="play" size={11} />
            </button>
          </>
        ) : (
          <span className="event-pick none" title={reason}>
            {t.noSound}
          </span>
        )}
      </article>
    )
  }

  return (
    <article className="event current" aria-current onClick={select}>
      <div className="event-top">
        <span className="led" ref={led} aria-hidden />
        <b className="event-name">{event.name || event.file}</b>
        <code className="event-file">{event.file}</code>
      </div>
      <div className="event-sound">
        {info?.playable ? (
          <>
            <button className="play" aria-label={t.play} onClick={play}>
              <Icon name="play" size={12} />
            </button>
            <span className="sound-name" title={info.id}>
              {info.name} <span className="muted">· {info.pack}</span>
            </span>
            <button
              className="x"
              aria-label={t.removeSound}
              title={t.removeSound}
              onClick={stop(() => dispatch({ type: 'assign', key: event.key, sound: null }))}
            >
              <Icon name="close" size={14} />
            </button>
          </>
        ) : (
          <span className="none" title={reason}>
            {t.noSound}
          </span>
        )}
      </div>
      <PercentSlider
        label={t.volume}
        value={event.volume}
        max={1}
        onChange={(volume, step) => update({ volume }, step)}
        onCommit={(volume) => player.playEvent({ ...event, volume })}
      />
      <PercentSlider
        label={t.pitch}
        value={event.pitch}
        max={MAX_PITCH}
        onChange={(pitch, step) => update({ pitch }, step)}
        onCommit={(pitch) => player.playEvent({ ...event, pitch })}
      />
      <details className="more" onClick={(e) => e.stopPropagation()}>
        <summary>{t.eventSettings}</summary>
        <EventEditor event={event} />
      </details>
    </article>
  )
}
