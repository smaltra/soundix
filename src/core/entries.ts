import { extForType, extOf } from './audio-types'
import type { SoundixSource } from './soundix-json'
import type { Library, LibraryPack, SoundEvent } from './types'

export type ExportFormat = 'original' | 'ogg'

export interface ExportEntry {
  event: SoundEvent
  /** Path inside the archive, e.g. sounds/click.ogg */
  path: string
  /** A library file (path under library/) or an own sound id */
  body: { url: string } | { own: string }
  source: SoundixSource
  pack?: LibraryPack
}

export { extOf } from './audio-types'

/** The archive file of every event that has a sound; the rest are skipped. */
export function resolveEntries(
  events: SoundEvent[],
  library: Library,
  format: ExportFormat,
  /** MIME type of an own sound this browser has ('' when unknown); null when it is gone */
  ownType: (id: string) => string | null = () => '',
) {
  const sounds = new Map(library.sounds.map((s) => [s.id, s]))
  const packs = new Map(library.packs.map((p) => [p.id, p]))
  const entries: ExportEntry[] = []
  const skipped: SoundEvent[] = []
  for (const event of events) {
    const ref = event.sound
    const sound = ref?.kind === 'library' ? sounds.get(ref.id) : undefined
    const pack = sound && packs.get(sound.pack)
    if (sound && pack) {
      const url = format === 'ogg' ? sound.preview : sound.original
      entries.push({
        event,
        pack,
        path: `sounds/${event.file}.${extOf(url)}`,
        body: { url },
        source: {
          library: sound.id,
          pack: pack.name,
          author: pack.author,
          license: pack.license,
          url: pack.url,
        },
      })
    } else if (ref?.kind === 'own' && ownType(ref.id) !== null) {
      // The file decides the extension: a sound made mono is a WAV whatever its old name said.
      const ext = extForType(ownType(ref.id) ?? '') || extOf(ref.name) || 'audio'
      entries.push({
        event,
        path: `sounds/${event.file}.${ext}`,
        body: { own: ref.id },
        source: {
          own: true,
          original: ref.name,
          ...(ref.generated && { generated: ref.generated }),
        },
      })
    } else skipped.push(event)
  }
  return { entries, skipped }
}
