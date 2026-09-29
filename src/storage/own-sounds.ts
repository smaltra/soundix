// Own sounds in IndexedDB (idb-keyval). Every call says whether storage did it; the caller decides.
import { createStore, del, set, values, type UseStore } from 'idb-keyval'
import type { OwnSound } from '../core/types'

export interface StoredOwnSound extends OwnSound {
  blob: Blob
  added: number
  /** The variant this sound is a copy of: the link seen from My sounds */
  variant?: string
}

let store: UseStore | null = null
const ownStore = () => (store ??= createStore('soundix', 'own-sounds'))

/** Stored own sounds; null when storage could not be read, which is not the same as none. */
export async function loadOwnSounds(): Promise<StoredOwnSound[] | null> {
  try {
    const all = await values<StoredOwnSound>(ownStore())
    return all.sort((a, b) => a.added - b.added)
  } catch {
    return null
  }
}

/** Stores a sound; false when storage refused. */
export async function putOwnSound(sound: StoredOwnSound): Promise<boolean> {
  try {
    await set(sound.id, sound, ownStore())
    return true
  } catch {
    return false
  }
}

/** Deletes a sound; false when storage refused. */
export async function deleteOwnSound(id: string): Promise<boolean> {
  try {
    await del(id, ownStore())
    return true
  } catch {
    return false
  }
}
