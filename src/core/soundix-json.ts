import type { ExportEntry } from './entries'
import { sanitizeUi, TRIGGERS, uiData, type UiElement } from './layout'
import type { VariantJson } from './project'
import { toFileName } from './names'
import { createEvent, sanitizeEvents } from './set'
import type { Generated, SoundEvent, SoundRef } from './types'

export interface SoundixSource {
  library?: string
  pack?: string
  author?: string
  license?: string
  url?: string
  own?: true
  original?: string
  generated?: Generated
}

export interface SoundixEventJson {
  id: string
  name: string
  /** Path in the archive; null when the event has no sound */
  file: string | null
  volume: number
  pitch: number
  words: string[]
  source?: SoundixSource
}

export interface SoundixJson {
  soundix: 2
  events: SoundixEventJson[]
  ui: ReturnType<typeof uiData>
  /** Generated variants the person did not pick; only in a project ZIP */
  variants?: VariantJson[]
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits

/** Every event (silent ones with file: null) and the wireframe. */
export function buildSoundixJson(
  events: SoundEvent[],
  entries: ExportEntry[],
  ui: UiElement[],
  variants: VariantJson[] = [],
): SoundixJson {
  const byKey = new Map(entries.map((e) => [e.event.key, e]))
  return {
    soundix: 2,
    events: events.map((event) => {
      const entry = byKey.get(event.key)
      return {
        id: event.file,
        name: event.name,
        file: entry?.path ?? null,
        volume: round(event.volume, 2),
        pitch: round(event.pitch, 3),
        words: event.words,
        ...(entry && { source: entry.source }),
      }
    }),
    ui: uiData(ui),
    ...(variants.length > 0 && { variants }),
  }
}

export type ImportError = 'not-json' | 'not-soundix' | 'bad-version' | 'bad-events' | 'bad-ui'
export type ImportResult =
  { ok: true; events: SoundEvent[]; ui: UiElement[] } | { ok: false; error: ImportError }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const fail = (error: ImportError): ImportResult => ({ ok: false, error })

/** Library sounds are found by id; own sounds cannot be imported and become missing. */
function refOf(source: unknown): SoundRef | null {
  if (!isObj(source)) return null
  if (typeof source.library === 'string') return { kind: 'library', id: source.library }
  if (source.own === true) return { kind: 'missing', label: source.original as string }
  return null
}

/** A source is absent, a library id or an own sound with its file name. */
const validSource = (source: unknown) =>
  source === undefined ||
  (isObj(source) &&
    (typeof source.library === 'string' ||
      (source.own === true && typeof source.original === 'string')))

/** Events the wireframe plays but the set does not have yet, added without a sound. */
function withReferencedEvents(events: SoundEvent[], ui: UiElement[]): SoundEvent[] {
  const result = [...events]
  for (const el of ui) {
    for (const trigger of TRIGGERS[el.kind]) {
      const id = el.sounds[trigger]
      if (id && !result.some((e) => e.file === id)) result.push(createEvent(id, result))
    }
  }
  return result
}

/**
 * Points the wireframe at the cleaned event ids ("_click" → click) and adds the events it plays
 * but the set lacks. `given` holds the ids the events had in the file, in the same order.
 */
export function bindUi(events: SoundEvent[], ui: UiElement[], given: unknown[] = []) {
  const ids = new Map<unknown, string>()
  given.forEach((id, i) => ids.has(id) || ids.set(id, events[i].file))
  const bound = ui.map((el) => {
    const sounds = { ...el.sounds }
    for (const trigger of TRIGGERS[el.kind]) {
      const id = sounds[trigger]
      if (id) sounds[trigger] = ids.get(id) ?? toFileName(id)
    }
    return { ...el, sounds }
  })
  return { events: withReferencedEvents(events, bound), ui: bound }
}

function parseEvents(list: unknown): SoundEvent[] | null {
  const valid = (e: unknown) => isObj(e) && typeof e.id === 'string' && validSource(e.source)
  if (!Array.isArray(list) || !list.every(valid)) return null
  return sanitizeEvents(
    (list as Obj[]).map((e) => ({
      name: e.name,
      file: e.id,
      volume: e.volume,
      pitch: e.pitch,
      words: e.words,
      sound: refOf(e.source),
    })),
  )
}

/**
 * Reads soundix.json v2 (or v1). Without "events" the current events stay and only the
 * wireframe is replaced, so an agent can send just { "soundix": 2, "ui": [...] }.
 */
export function parseSoundixJson(text: string, current: SoundEvent[]): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return fail('not-json')
  }
  if (!isObj(data) || !('soundix' in data)) return fail('not-soundix')
  if (data.soundix !== 1 && data.soundix !== 2) return fail('bad-version')
  let events = current
  let given: unknown[] = []
  if ('events' in data || data.soundix === 1) {
    const parsed = parseEvents(data.events)
    if (!parsed) return fail('bad-events')
    events = parsed
    given = (data.events as Obj[]).map((e) => e.id)
  }
  let ui: UiElement[] = []
  if (data.soundix === 2 && 'ui' in data) {
    const parsed = sanitizeUi(data.ui)
    if (!parsed) return fail('bad-ui')
    ui = parsed
  }
  return { ok: true, ...bindUi(events, ui, given) }
}
