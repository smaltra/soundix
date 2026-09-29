import { useEffect, useMemo, useRef, useState } from 'react'
import { groupByPack, searchSounds, suggestSounds } from '../core/search'
import { DEFAULT_VOLUME } from '../core/set'
import type { ListSound } from '../core/types'
import { SoundRow, type RowActions } from './SoundRow'
import { OWN_PACK, ownToList, packName, refFor } from './sounds'
import { soundIdOf, useApp, useServices } from './store'
import { GenerateDialog } from './GenerateDialog'
import { Icon } from './icons'

type Mode = 'all' | 'suggested'

/** Keys typed into fields or pressed with a dialog open are not ours. */
export function isFreeKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  const typing = target?.closest?.('input, textarea, select, [contenteditable="true"]')
  return !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('dialog[open]')
}

export function LibraryPanel({ onAddOwn }: { onAddOwn: (files: File[]) => void }) {
  const { state, dispatch, t } = useApp()
  const { library, own, player, toast } = useServices()
  const [mode, setMode] = useState<Mode>('suggested')
  const [query, setQuery] = useState('')
  const [pack, setPack] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [generating, setGenerating] = useState(false)

  const current = state.events.find((e) => e.key === state.currentKey) ?? null
  const chosenId = current ? soundIdOf(current) : null

  const items = useMemo<ListSound[]>(
    () => [...library.library.sounds, ...own.list.map(ownToList)],
    [library, own.list],
  )
  const byId = useMemo(() => new Map(items.map((s) => [s.id, s])), [items])
  const words = current?.words
  const groups = useMemo(() => {
    const found = searchSounds(items, { query, pack })
    return groupByPack(mode === 'suggested' ? suggestSounds(found, words ?? []) : found)
  }, [items, query, pack, mode, words])
  const order = useMemo(() => groups.flatMap((g) => g.sounds), [groups])

  // Handlers read the latest values through a ref, so rows keep stable props.
  const latest = useRef({ current, byId, order, cursor })
  latest.current = { current, byId, order, cursor }

  const { playSound } = player
  const removeOwn = own.remove
  const actions = useMemo<RowActions>(() => {
    const audition = (id: string) => {
      const event = latest.current.current
      playSound(id, event?.volume ?? DEFAULT_VOLUME, event?.pitch ?? 0)
    }
    return {
      play: (id) => {
        setCursor(id)
        audition(id)
      },
      choose: (id) => {
        const { current, byId } = latest.current
        const sound = byId.get(id)
        if (current && sound) dispatch({ type: 'assign', key: current.key, sound: refFor(sound) })
      },
      favorite: (id) => dispatch({ type: 'favorite', id }),
      remove: (id) => {
        void removeOwn(id).then((done) => done || toast(t.deleteFailed(1)))
        dispatch({ type: 'forgetOwn', id })
      },
    }
  }, [playSound, dispatch, removeOwn, toast, t])

  useEffect(() => {
    const move = (step: number) => {
      const { order, cursor } = latest.current
      if (!order.length) return
      const index = order.findIndex((s) => s.id === cursor)
      const next = index < 0 ? 0 : Math.min(order.length - 1, Math.max(0, index + step))
      actions.play(order[next].id)
      document
        .querySelector(`[data-sound-id="${CSS.escape(order[next].id)}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    }
    const onKey = (e: KeyboardEvent) => {
      if (!isFreeKey(e)) return
      const { cursor } = latest.current
      const onButton = (e.target as HTMLElement).closest?.('button, a')
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        move(e.key === 'ArrowDown' ? 1 : -1)
      } else if ((e.key === ' ' || e.key === 'Enter') && cursor && !onButton) {
        e.preventDefault()
        if (e.key === ' ') actions.play(cursor)
        else actions.choose(cursor)
      } else if (e.code === 'KeyS' && cursor) {
        actions.favorite(cursor)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [actions])

  const favorites = state.favorites
    .map((id) => byId.get(id))
    .filter((s): s is ListSound => s !== undefined)
  const packOptions = [...library.library.packs.map((p) => [p.id, p.name]), [OWN_PACK, t.ownPack]]

  return (
    <section className="library" aria-label="Library">
      <div className="lib-head">
        <p className="for">
          {current ? (
            <>
              {t.chooseFor} <b>{current.name}</b> <code>{current.file}</code>
            </>
          ) : (
            t.noCurrent
          )}
        </p>
        <div className="lib-bar">
          <div className="seg" role="group">
            {(['all', 'suggested'] as Mode[]).map((m) => (
              <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === 'all' ? t.allSounds : t.suggested}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
            onChange={(e) => {
              // Typing searches the whole library.
              if (!query && e.target.value) setMode('all')
              setQuery(e.target.value)
            }}
          />
          <select value={pack} onChange={(e) => setPack(e.target.value)} aria-label={t.allPacks}>
            <option value="">{t.allPacks}</option>
            {packOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <span className="count">{t.found(order.length)}</span>
          <span className="keys-hint" title={t.keys} aria-label={t.keys} role="img">
            <Icon name="keyboard" size={18} />
          </span>
          <button className="btn small" onClick={() => fileInput.current?.click()}>
            <Icon name="music" size={14} />
            {t.addOwn}
          </button>
          <button
            className="btn small"
            disabled={!current}
            title={current ? undefined : t.genNoEvent}
            onClick={() => setGenerating(true)}
          >
            <Icon name="sparkle" size={14} />
            {t.generate}
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept="audio/*,.ogg,.oga,.flac,.m4a,.wav,.mp3"
            onChange={(e) => {
              onAddOwn([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
        </div>
        {favorites.length > 0 && (
          <div className="favorites" aria-label={t.favorites}>
            {favorites.map((s) => (
              <span key={s.id} className={`chip${s.id === chosenId ? ' chosen' : ''}`}>
                <button className="play" aria-label={t.play} onClick={() => actions.play(s.id)}>
                  <Icon name="play" size={11} />
                </button>
                <span className="chip-name" title={s.id}>
                  {s.name}
                </span>
                <button
                  className="pick"
                  disabled={!current}
                  onClick={() => actions.choose(s.id)}
                  aria-label={s.id === chosenId ? t.chosen : t.choose}
                >
                  {s.id === chosenId ? <Icon name="check" size={14} /> : t.choose}
                </button>
                <button className="x" aria-label={t.close} onClick={() => actions.favorite(s.id)}>
                  <Icon name="close" size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="lib-list">
        {library.status === 'loading' && <p className="empty">{t.loading}</p>}
        {library.status === 'error' && <p className="empty error">{t.loadError}</p>}
        {library.status === 'ready' && mode === 'suggested' && !words?.length && (
          <p className="empty">{t.noWords}</p>
        )}
        {library.status === 'ready' &&
          order.length === 0 &&
          (mode === 'all' || !!words?.length) && <p className="empty">{t.nothingFound}</p>}
        {groups.map((group) => (
          <section key={group.pack} className="pack-group">
            <h3>
              {packName(group.pack, library, t)} <span>{group.sounds.length}</span>
            </h3>
            <div className="rows">
              {group.sounds.map((s) => (
                <SoundRow
                  key={s.id}
                  sound={s}
                  cursor={s.id === cursor}
                  chosen={s.id === chosenId}
                  starred={state.favorites.includes(s.id)}
                  canChoose={!!current}
                  actions={actions}
                  t={t}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      {generating && current && (
        <GenerateDialog key={current.key} event={current} onClose={() => setGenerating(false)} />
      )}
    </section>
  )
}
