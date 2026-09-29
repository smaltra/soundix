import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { sanitizeUi, uiData, type UiElement } from './layout'
import { sanitizeEvents } from './set'
import { bindUi } from './soundix-json'
import type { SoundEvent, SoundRef } from './types'

type Obj = Record<string, unknown>

export const SHARE_VERSION = 2

export interface ShareData {
  events: SoundEvent[]
  ui: UiElement[]
}

/** Library id, own file name (the sound itself is not shared) or nothing. */
type SharedSound = string | { own: string } | null

function packSound(ref: SoundRef | null): SharedSound {
  if (!ref) return null
  if (ref.kind === 'library') return ref.id
  return { own: ref.kind === 'own' ? ref.name : ref.label }
}

function unpackSound(value: unknown): SoundRef | null {
  if (typeof value === 'string' && value) return { kind: 'library', id: value }
  const own = (value as { own?: unknown } | null)?.own
  return typeof own === 'string' ? { kind: 'missing', label: own } : null
}

export function encodeShare({ events, ui }: ShareData): string {
  const payload = {
    soundix: SHARE_VERSION,
    events: events.map((e) => ({
      id: e.file,
      name: e.name,
      sound: packSound(e.sound),
      volume: e.volume,
      pitch: e.pitch,
      words: e.words,
    })),
    ui: uiData(ui),
  }
  return compressToEncodedURIComponent(JSON.stringify(payload))
}

export function decodeShare(text: string): ShareData | null {
  try {
    const payload = JSON.parse(decompressFromEncodedURIComponent(text) || '')
    if (payload?.soundix !== SHARE_VERSION || !Array.isArray(payload.events)) return null
    const isEvent = (e: unknown) =>
      !!e && typeof e === 'object' && !Array.isArray(e) && typeof (e as Obj).id === 'string'
    if (!payload.events.every(isEvent)) return null
    const ui = sanitizeUi('ui' in payload ? payload.ui : [])
    if (!ui) return null
    const raw: Obj[] = payload.events
    const events = sanitizeEvents(
      raw.map((e) => ({ ...e, file: e.id, sound: unpackSound(e.sound) })),
    )
    return bindUi(
      events,
      ui,
      raw.map((e) => e.id),
    )
  } catch {
    return null
  }
}

export const shareUrl = (base: string, data: ShareData) => `${base}#s=${encodeShare(data)}`

export const readShareHash = (hash: string) => (hash.startsWith('#s=') ? hash.slice(3) : null)
