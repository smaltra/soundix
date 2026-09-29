import { toFileName, uniqueFileName } from './names'
import type { SoundEvent, SoundRef } from './types'

export const DEFAULT_VOLUME = 0.8
export const DEFAULT_PITCH = 0.05
export const MAX_PITCH = 0.2

let seq = 0
export const newKey = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`

const LATIN = /^[\x20-\x7e]+$/

const filesOf = (events: SoundEvent[]) => events.map((e) => e.file)

/** A new event; its file name is the unique transliteration of the name. */
export function createEvent(name: string, events: SoundEvent[]): SoundEvent {
  const title = name.trim()
  const file = uniqueFileName(toFileName(title), filesOf(events))
  return {
    key: newKey(),
    name: title || file,
    file,
    sound: null,
    volume: DEFAULT_VOLUME,
    pitch: DEFAULT_PITCH,
    words: LATIN.test(title) ? [title.toLowerCase()] : [],
  }
}

/** Cleans a file name typed for one event and keeps it unique in the set. */
export function fixFileName(raw: string, key: string, events: SoundEvent[]): string {
  return uniqueFileName(toFileName(raw), filesOf(events.filter((e) => e.key !== key)))
}

export interface RawEvent {
  name?: unknown
  file?: unknown
  volume?: unknown
  pitch?: unknown
  words?: unknown
  sound: SoundRef | null
}

const clamp = (value: unknown, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : fallback

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const stringsOf = (value: unknown) =>
  Array.isArray(value) ? value.filter((w): w is string => typeof w === 'string') : []

/** Valid events from untrusted input: unique file names, clamped numbers, string words. */
export function sanitizeEvents(raw: RawEvent[]): SoundEvent[] {
  const events: SoundEvent[] = []
  for (const r of raw) {
    const name = text(r.name) || text(r.file)
    const file = uniqueFileName(toFileName(text(r.file) || name), filesOf(events))
    events.push({
      key: newKey(),
      name: name || file,
      file,
      sound: r.sound,
      volume: clamp(r.volume, 1, DEFAULT_VOLUME),
      pitch: clamp(r.pitch, MAX_PITCH, DEFAULT_PITCH),
      words: stringsOf(r.words),
    })
  }
  return events
}
