export type Lang = 'en' | 'ru'

export interface LibraryPack {
  id: string
  name: string
  author: string
  url: string
  license: string
}

export interface LibrarySound {
  id: string
  pack: string
  name: string
  tags: string[]
  duration: number
  /** OGG file under library/ */
  preview: string
  /** File for "Original" export under library/; equals preview for OGG sources */
  original: string
}

export interface Library {
  version: number
  packs: LibraryPack[]
  sounds: LibrarySound[]
}

/** A row of the sound list: a library sound or an own sound (pack 'own'). */
export interface ListSound {
  id: string
  pack: string
  name: string
  tags: string[]
  duration: number
  generated?: Generated
}

/** How a sound was generated on fal.ai */
export interface Generated {
  /** fal endpoint id */
  model: string
  prompt: string
}

export type SoundRef =
  | { kind: 'library'; id: string }
  | { kind: 'own'; id: string; name: string; generated?: Generated }
  /** An own sound that a link or an import could not carry */
  | { kind: 'missing'; label: string }

export interface SoundEvent {
  /** Stable key inside the app; not exported */
  key: string
  name: string
  /** [a-z0-9_], unique in the set */
  file: string
  sound: SoundRef | null
  /** 0..1 */
  volume: number
  /** Pitch spread, 0..0.2 */
  pitch: number
  /** Search words for "Suggested" */
  words: string[]
}

export interface OwnSound {
  id: string
  name: string
  type: string
  duration: number
  generated?: Generated
}
