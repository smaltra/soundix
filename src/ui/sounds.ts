import type { ListSound, SoundRef } from '../core/types'
import type { Dict } from '../i18n/en'
import type { StoredOwnSound } from '../storage/own-sounds'
import type { LibraryData } from './hooks'

export const OWN_PACK = 'own'

export const ownToList = (s: StoredOwnSound): ListSound => ({
  id: s.id,
  pack: OWN_PACK,
  name: s.name,
  tags: [],
  duration: s.duration,
  ...(s.generated && { generated: s.generated }),
})

export const packName = (pack: string, library: LibraryData, t: Dict) =>
  pack === OWN_PACK ? t.ownPack : (library.packs.get(pack)?.name ?? pack)

export type SoundInfo =
  { playable: true; id: string; name: string; pack: string } | { playable: false; reason: string }

/** What an event card shows for its sound. */
export function describeSound(
  ref: SoundRef,
  library: LibraryData,
  own: StoredOwnSound[],
  t: Dict,
): SoundInfo {
  if (ref.kind === 'missing') return { playable: false, reason: t.missingOwn(ref.label) }
  if (ref.kind === 'own') {
    const sound = own.find((s) => s.id === ref.id)
    return sound
      ? { playable: true, id: ref.id, name: sound.name, pack: t.ownPack }
      : { playable: false, reason: t.missingOwn(ref.name) }
  }
  const sound = library.sounds.get(ref.id)
  if (sound) {
    return { playable: true, id: ref.id, name: sound.name, pack: packName(sound.pack, library, t) }
  }
  return {
    playable: false,
    reason: library.status === 'loading' ? t.loading : `${t.missingLibrary}: ${ref.id}`,
  }
}

/** The reference an event stores for a list sound. */
export const refFor = (sound: ListSound): SoundRef =>
  sound.pack === OWN_PACK
    ? {
        kind: 'own',
        id: sound.id,
        name: sound.name,
        ...(sound.generated && { generated: sound.generated }),
      }
    : { kind: 'library', id: sound.id }

export const formatDuration = (seconds: number) => `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`
