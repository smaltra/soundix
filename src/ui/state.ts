import { createExample, EXAMPLE_VERSION } from '../core/example'
import {
  createElement,
  elementId,
  place,
  removeElement,
  renameElementInUi,
  renameEventInUi,
  sanitizeUi,
  uiData,
  type UiElement,
  type UiKind,
} from '../core/layout'
import { fromV2 } from '../core/migrate'
import { toFileName, uniqueFileName } from '../core/names'
import { createEvent, fixFileName, sanitizeEvents } from '../core/set'
import type { SoundEvent, SoundRef } from '../core/types'
import { loadSaved, loadV2 } from '../storage/local'

export interface SetSnapshot {
  events: SoundEvent[]
  /** The wireframe */
  ui: UiElement[]
}

/** What the right panel shows: the library for the current event or the selected element. */
export type Panel = 'sound' | 'element'

export interface AppState extends SetSnapshot {
  /** The set before the last replace; "Restore previous" swaps it back */
  backup: SetSnapshot | null
  currentKey: string | null
  /** Selected wireframe element */
  selectedId: string | null
  panel: Panel
  /** Sound ids (library ids or own ids) */
  favorites: string[]
  listenVolume: number
  /** Undo and redo of set edits; not stored */
  history: History
  /** Version of the starter example while nobody has changed it; null otherwise */
  example: number | null
}

/** A set in the undo history; the example mark comes back with it. */
type Step = SetSnapshot & { example: number | null }

export interface History {
  past: Step[]
  future: Step[]
  /** Edits of one gesture in a row become one undo step (typing in a field, a drag, a slider) */
  lastStep: number | null
}

const EMPTY_HISTORY: History = { past: [], future: [], lastStep: null }
const HISTORY_LIMIT = 100

let steps = 0
/** A new gesture: edits dispatched with the same step are undone together. */
export const newStep = () => ++steps

type EventPatch = Partial<Pick<SoundEvent, 'name' | 'volume' | 'pitch' | 'words'>>

export type Action =
  | { type: 'select'; key: string }
  | { type: 'add'; name: string }
  | { type: 'update'; key: string; patch: EventPatch; step?: number }
  | { type: 'file'; key: string; raw: string }
  | { type: 'remove'; key: string }
  | { type: 'assign'; key: string; sound: SoundRef | null }
  | { type: 'replace'; events: SoundEvent[]; ui: UiElement[]; example?: number }
  | { type: 'restore' }
  | { type: 'favorite'; id: string }
  | { type: 'panel'; panel: Panel }
  | { type: 'selectElement'; id: string | null }
  | { type: 'addElement'; kind: UiKind; text: string }
  | { type: 'updateElement'; id: string; patch: Partial<Omit<UiElement, 'id'>>; step?: number }
  | { type: 'elementId'; id: string; raw: string }
  | { type: 'duplicateElement'; id: string }
  | { type: 'removeElement'; id: string }
  | { type: 'listenVolume'; value: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'forgetOwn'; id: string }
  | { type: 'ownRenamed'; id: string; name: string }
  | { type: 'ownLoaded'; ids: string[] }

/** A patch that leaves every field as it is. */
const unchanged = (item: object, patch: object) =>
  Object.entries(patch).every(
    ([k, v]) => JSON.stringify((item as Record<string, unknown>)[k]) === JSON.stringify(v),
  )

const mapEvents = (state: AppState, key: string, fn: (e: SoundEvent) => SoundEvent) => ({
  ...state,
  events: state.events.map((e) => (e.key === key ? fn(e) : e)),
})

const mapSounds = (events: SoundEvent[], fn: (ref: SoundRef) => SoundRef | null) =>
  events.map((e) => (e.sound ? { ...e, sound: fn(e.sound) } : e))

/** Applies a sound change to the current set and to the backup, which can come back. */
const mapAllSounds = (state: AppState, fn: (ref: SoundRef) => SoundRef | null) => ({
  events: mapSounds(state.events, fn),
  backup: state.backup && { ...state.backup, events: mapSounds(state.backup.events, fn) },
})

function renameFile(state: AppState, key: string, raw: string): AppState {
  const event = state.events.find((e) => e.key === key)
  if (!event) return state
  const file = fixFileName(raw, key, state.events)
  if (file === event.file) return state
  return {
    ...mapEvents(state, key, (e) => ({ ...e, file })),
    ui: renameEventInUi(state.ui, event.file, file),
  }
}

function removeEvent(state: AppState, key: string): AppState {
  const index = state.events.findIndex((e) => e.key === key)
  const events = state.events.filter((e) => e.key !== key)
  const currentKey =
    state.currentKey === key
      ? (events[Math.min(index, events.length - 1)]?.key ?? null)
      : state.currentKey
  return { ...state, events, currentKey }
}

const snapshot = (state: AppState): SetSnapshot => ({ events: state.events, ui: state.ui })

const mapElement = (state: AppState, id: string, fn: (el: UiElement) => UiElement) => ({
  ...state,
  ui: state.ui.map((el) => (el.id === id ? fn(el) : el)),
})

const GEOMETRY = ['x', 'y', 'w', 'h'] as const

function updateElement(el: UiElement, patch: Partial<Omit<UiElement, 'id'>>): UiElement {
  const next = { ...el, ...patch }
  return GEOMETRY.some((k) => k in patch) ? place(next, next) : next
}

function renameElement(state: AppState, id: string, raw: string): AppState {
  const others = state.ui.filter((el) => el.id !== id).map((el) => el.id)
  const next = uniqueFileName(toFileName(raw), others)
  if (next === id) return state
  return { ...state, ui: renameElementInUi(state.ui, id, next), selectedId: next }
}

function duplicate(state: AppState, id: string): AppState {
  const el = state.ui.find((e) => e.id === id)
  if (!el) return state
  const copy = place(
    {
      ...el,
      id: elementId(
        el.text,
        el.kind,
        state.ui.map((e) => e.id),
      ),
    },
    { ...el, x: el.x + 0.02, y: el.y + 0.02 },
  )
  return { ...state, ui: [...state.ui, copy], selectedId: copy.id, panel: 'element' }
}

function apply(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'select':
      return { ...state, currentKey: action.key, panel: 'sound' }
    case 'add': {
      const event = createEvent(action.name, state.events)
      return { ...state, events: [...state.events, event], currentKey: event.key }
    }
    case 'update': {
      const event = state.events.find((e) => e.key === action.key)
      if (!event || unchanged(event, action.patch)) return state
      return mapEvents(state, action.key, (e) => ({ ...e, ...action.patch }))
    }
    case 'file':
      return renameFile(state, action.key, action.raw)
    case 'remove':
      return removeEvent(state, action.key)
    case 'assign':
      return mapEvents(state, action.key, (e) => ({ ...e, sound: action.sound }))
    case 'replace':
      return {
        ...state,
        events: action.events,
        ui: action.ui,
        backup: snapshot(state),
        currentKey: action.events[0]?.key ?? null,
        selectedId: null,
        example: action.example ?? null,
      }
    case 'restore':
      if (!state.backup) return state
      return {
        ...state,
        ...state.backup,
        backup: snapshot(state),
        currentKey: state.backup.events[0]?.key ?? null,
        selectedId: null,
      }
    case 'favorite': {
      const on = state.favorites.includes(action.id)
      const favorites = on
        ? state.favorites.filter((id) => id !== action.id)
        : [...state.favorites, action.id]
      return { ...state, favorites }
    }
    case 'panel':
      return { ...state, panel: action.panel }
    case 'selectElement':
      return { ...state, selectedId: action.id, panel: action.id ? 'element' : state.panel }
    case 'addElement': {
      const el = createElement(
        action.kind,
        action.text,
        state.ui,
        state.events.map((e) => e.file),
      )
      return { ...state, ui: [...state.ui, el], selectedId: el.id, panel: 'element' }
    }
    case 'updateElement': {
      const el = state.ui.find((e) => e.id === action.id)
      if (!el || unchanged(el, action.patch)) return state
      return mapElement(state, action.id, (e) => updateElement(e, action.patch))
    }
    case 'elementId':
      return renameElement(state, action.id, action.raw)
    case 'duplicateElement':
      return duplicate(state, action.id)
    case 'removeElement':
      return {
        ...state,
        ui: removeElement(state.ui, action.id),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      }
    case 'listenVolume':
      return { ...state, listenVolume: action.value }
    case 'forgetOwn':
      return {
        ...state,
        ...mapAllSounds(state, (r) => (r.kind === 'own' && r.id === action.id ? null : r)),
        favorites: state.favorites.filter((id) => id !== action.id),
      }
    case 'ownRenamed': {
      // Everywhere the sound is named: the set, the backup and every undo and redo step.
      const rename = (r: SoundRef) =>
        r.kind === 'own' && r.id === action.id ? { ...r, name: action.name } : r
      const steps = (list: Step[]) =>
        list.map((s) => ({ ...s, events: mapSounds(s.events, rename) }))
      return {
        ...state,
        ...mapAllSounds(state, rename),
        history: {
          ...state.history,
          past: steps(state.history.past),
          future: steps(state.history.future),
        },
      }
    }
    case 'undo':
    case 'redo':
      return state // handled by reducer
    case 'ownLoaded': {
      // Own sounds that this browser no longer has become "missing".
      const known = new Set(action.ids)
      const lost = (r: SoundRef): SoundRef =>
        r.kind === 'own' && !known.has(r.id) ? { kind: 'missing', label: r.name } : r
      return {
        ...state,
        ...mapAllSounds(state, lost),
        favorites: state.favorites.filter((id) => !id.startsWith('own:') || known.has(id)),
      }
    }
  }
}

// ---------- undo ----------

/** Actions that change the set and can be undone. */
const UNDOABLE = new Set<Action['type']>([
  'add',
  'update',
  'file',
  'remove',
  'assign',
  'replace',
  'restore',
  'addElement',
  'updateElement',
  'elementId',
  'duplicateElement',
  'removeElement',
])

const stepOf = (action: Action) =>
  (action.type === 'update' || action.type === 'updateElement') && action.step ? action.step : null

const record = (state: AppState): Step => ({ ...snapshot(state), example: state.example })

/** Keeps the selection pointing at things that still exist after undo or redo. */
function settle(state: AppState, snap: Step, history: History): AppState {
  const current = snap.events.find((e) => e.key === state.currentKey) ?? snap.events[0]
  const selected = snap.ui.some((el) => el.id === state.selectedId) ? state.selectedId : null
  return { ...state, ...snap, currentKey: current?.key ?? null, selectedId: selected, history }
}

function undo(state: AppState): AppState {
  const { past, future } = state.history
  const prev = past.at(-1)
  if (!prev) return state
  return settle(state, prev, {
    past: past.slice(0, -1),
    future: [record(state), ...future],
    lastStep: null,
  })
}

function redo(state: AppState): AppState {
  const { past, future } = state.history
  const next = future[0]
  if (!next) return state
  return settle(state, next, {
    past: [...past, record(state)],
    future: future.slice(1),
    lastStep: null,
  })
}

export function reducer(state: AppState, action: Action): AppState {
  if (action.type === 'undo') return undo(state)
  if (action.type === 'redo') return redo(state)
  const next = apply(state, action)
  const changed = next.events !== state.events || next.ui !== state.ui
  if (!UNDOABLE.has(action.type) || !changed) return next
  const step = stepOf(action)
  const { history } = state
  const sameStep = step !== null && step === history.lastStep
  const past = sameStep ? history.past : [...history.past, record(state)].slice(-HISTORY_LIMIT)
  const example = action.type === 'replace' ? next.example : null
  return { ...next, example, history: { past, future: [], lastStep: step } }
}

// ---------- persistence ----------

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

function restoreRef(raw: unknown): SoundRef | null {
  if (!isObj(raw) || typeof raw.kind !== 'string') return null
  if (raw.kind === 'library' && typeof raw.id === 'string') return { kind: 'library', id: raw.id }
  if (raw.kind === 'own' && typeof raw.id === 'string' && typeof raw.name === 'string') {
    const g = raw.generated
    const generated =
      isObj(g) && typeof g.model === 'string' && typeof g.prompt === 'string'
        ? { model: g.model, prompt: g.prompt }
        : undefined
    return { kind: 'own', id: raw.id, name: raw.name, ...(generated && { generated }) }
  }
  if (raw.kind === 'missing' && typeof raw.label === 'string') {
    return { kind: 'missing', label: raw.label }
  }
  return null
}

function restoreSet(raw: unknown): SetSnapshot | null {
  if (!isObj(raw) || !Array.isArray(raw.events)) return null
  const events = sanitizeEvents(
    raw.events.filter(isObj).map((e) => ({ ...e, sound: restoreRef(e.sound) })),
  )
  return { events, ui: sanitizeUi(raw.ui) ?? [] }
}

const volumeOf = (v: unknown) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : 1)

export function initialState(): AppState {
  const raw = loadSaved() ?? fromV2(loadV2())
  const s: Obj = isObj(raw) ? raw : {}
  // An untouched example from an older version gives way to the current example.
  const oldExample = typeof s.example === 'number' && s.example !== EXAMPLE_VERSION
  const saved = oldExample ? null : restoreSet(s)
  const set = saved ?? createExample('en')
  const current = set.events.find((e) => e.file === s.current) ?? set.events[0]
  return {
    ...set,
    backup: restoreSet(s.backup),
    currentKey: current?.key ?? null,
    selectedId: null,
    panel: 'sound',
    favorites: Array.isArray(s.favorites)
      ? s.favorites.filter((id): id is string => typeof id === 'string')
      : [],
    listenVolume: volumeOf(s.listenVolume),
    history: EMPTY_HISTORY,
    example: saved ? (typeof s.example === 'number' ? s.example : null) : EXAMPLE_VERSION,
  }
}

/** What goes into localStorage; keys are dropped, the current event is kept by file name. */
export function persisted(state: AppState) {
  const strip = (set: SetSnapshot) => ({
    events: set.events.map(({ key: _key, ...rest }) => rest),
    ui: uiData(set.ui),
  })
  return {
    ...strip(state),
    backup: state.backup && strip(state.backup),
    current: state.events.find((e) => e.key === state.currentKey)?.file ?? null,
    favorites: state.favorites,
    listenVolume: state.listenVolume,
    example: state.example,
  }
}
