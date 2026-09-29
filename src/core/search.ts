import type { ListSound } from './types'

export interface SearchFilter {
  query: string
  /** Pack id, '' for all packs */
  pack: string
}

const haystack = (s: ListSound) => `${s.name} ${s.tags.join(' ')}`.toLowerCase()

/** Sounds whose name or tags contain every query word, optionally in one pack. */
export function searchSounds<T extends ListSound>(sounds: T[], { query, pack }: SearchFilter): T[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  return sounds.filter((s) => {
    if (pack && s.pack !== pack) return false
    const text = haystack(s)
    return tokens.every((t) => text.includes(t))
  })
}

/** Index of the first word found in the sound's name or tags, or -1. */
function rankOf(sound: ListSound, words: string[]): number {
  const name = sound.name.toLowerCase()
  const tags = sound.tags.map((t) => t.toLowerCase())
  return words.findIndex((w) => name.includes(w) || tags.some((t) => t.includes(w)))
}

/** Sounds matching the event words: an earlier word ranks higher, then a shorter sound. */
export function suggestSounds<T extends ListSound>(sounds: T[], words: string[]): T[] {
  const needles = words.map((w) => w.trim().toLowerCase()).filter(Boolean)
  return sounds
    .map((sound) => ({ sound, rank: rankOf(sound, needles) }))
    .filter((m) => m.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.sound.duration - b.sound.duration)
    .map((m) => m.sound)
}

export interface PackGroup<T> {
  pack: string
  sounds: T[]
}

/** Groups by pack; packs keep the order of their first sound, sounds keep their order. */
export function groupByPack<T extends ListSound>(sounds: T[]): PackGroup<T>[] {
  const groups = new Map<string, T[]>()
  for (const s of sounds) {
    const list = groups.get(s.pack)
    if (list) list.push(s)
    else groups.set(s.pack, [s])
  }
  return [...groups].map(([pack, list]) => ({ pack, sounds: list }))
}
