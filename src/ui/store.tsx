import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react'
import { libraryUrl } from '../adapters/zip'
import { loadBuffer, playBuffer, unlockOnFirstGesture } from '../audio/player'
import type { SoundEvent } from '../core/types'
import { en, type Dict } from '../i18n/en'
import { save } from '../storage/local'
import { sharedRuns } from '../core/serial'
import { flash } from './flash'
import {
  useLibraryData,
  useOwnSoundsData,
  useVariantsData,
  type Copies,
  type LibraryData,
  type OwnSounds,
  type Variants,
} from './hooks'
import { initialState, persisted, reducer, type Action, type AppState } from './state'

export interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

export interface Player {
  /** Plays a library or own sound by id at volume × listen volume. */
  playSound: (id: string, volume: number, pitch: number) => void
  playEvent: (event: SoundEvent) => void
}

interface Services {
  library: LibraryData
  own: OwnSounds
  /** Generated variants per event, kept across sessions */
  variants: Variants
  copies: Copies
  player: Player
  toast: (text: string, action?: Toast['action']) => void
  toasts: Toast[]
  dismiss: (id: number) => void
}

interface StateValue {
  state: AppState
  dispatch: Dispatch<Action>
  t: Dict
}

const StateContext = createContext<StateValue | null>(null)
const ServicesContext = createContext<Services | null>(null)

export function useApp() {
  const value = useContext(StateContext)
  if (!value) throw new Error('useApp outside StoreProvider')
  return value
}

export function useServices() {
  const value = useContext(ServicesContext)
  if (!value) throw new Error('useServices outside StoreProvider')
  return value
}

/** Sound id of an event, or null when it has nothing playable. */
export const soundIdOf = (event: SoundEvent) =>
  event.sound && event.sound.kind !== 'missing' ? event.sound.id : null

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(0)
  const dismiss = useCallback(
    (id: number) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  )
  const toast = useCallback(
    (text: string, action?: Toast['action']) => {
      const id = ++next.current
      setToasts((all) => [...all.slice(-2), { id, text, action }])
      setTimeout(() => dismiss(id), action ? 9000 : 4000)
    },
    [dismiss],
  )
  return { toasts, toast, dismiss }
}

function usePlayer(
  library: LibraryData,
  own: OwnSounds,
  listenVolume: number,
): Player & {
  preload: (ids: string[]) => void
} {
  const latest = useRef({ library, own, listenVolume })
  latest.current = { library, own, listenVolume }

  const bufferFor = useCallback((id: string) => {
    const { library, own } = latest.current
    if (id.startsWith('own:')) {
      const sound = own.list.find((s) => s.id === id)
      return sound ? loadBuffer(id, () => sound.blob.arrayBuffer()) : null
    }
    const sound = library.sounds.get(id)
    if (!sound) return null
    return loadBuffer(id, async () => {
      const response = await fetch(libraryUrl(sound.preview))
      if (!response.ok) throw new Error(`${response.status} ${sound.preview}`)
      return response.arrayBuffer()
    })
  }, [])

  const playSound = useCallback(
    (id: string, volume: number, pitch: number) => {
      bufferFor(id)
        ?.then((buffer) => playBuffer(buffer, volume * latest.current.listenVolume, pitch))
        .catch(() => undefined)
    },
    [bufferFor],
  )

  const playEvent = useCallback(
    (event: SoundEvent) => {
      const id = soundIdOf(event)
      if (!id) return
      flash(event.key)
      playSound(id, event.volume, event.pitch)
    },
    [playSound],
  )

  const preload = useCallback(
    (ids: string[]) => ids.forEach((id) => bufferFor(id)?.catch(() => undefined)),
    [bufferFor],
  )

  return { playSound, playEvent, preload }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const library = useLibraryData()
  const own = useOwnSoundsData()
  const variants = useVariantsData()
  const copies = useRef<Copies>(sharedRuns()).current
  const { toasts, toast, dismiss } = useToasts()
  const { preload, ...player } = usePlayer(library, own, state.listenVolume)
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => save(persisted(state)), [state])
  useEffect(() => unlockOnFirstGesture(() => setUnlocked(true)), [])

  useEffect(() => {
    if (own.ready) dispatch({ type: 'ownLoaded', ids: own.list.map((s) => s.id) })
    // Only once own sounds are loaded; later deletions go through forgetOwn.
  }, [own.ready])

  // Decode the chosen sounds ahead so the mock answers at once.
  useEffect(() => {
    if (!unlocked || library.status !== 'ready') return
    preload(state.events.map(soundIdOf).filter((id): id is string => id !== null))
  }, [unlocked, library.status, state.events, preload])

  const stateValue = useMemo(() => ({ state, dispatch, t: en as Dict }), [state])
  const services = useMemo(
    () => ({ library, own, variants, copies, player, toast, toasts, dismiss }),
    // player functions and copies are stable
    [library, own, variants, toast, toasts, dismiss],
  )

  return (
    <StateContext.Provider value={stateValue}>
      <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>
    </StateContext.Provider>
  )
}
