// Generated variants in IndexedDB, kept across sessions. Every call says whether storage did it.
import { createStore, delMany, set, values, type UseStore } from 'idb-keyval'
import type { Generated } from '../core/types'

export interface StoredVariant {
  id: string
  /** Id (file name) of the event the variant was generated for */
  event: string
  /** #1, #2… per event */
  n: number
  blob: Blob
  duration: number
  generated: Generated
  added: number
  /** My sounds id once the variant was used */
  savedId?: string
}

let store: UseStore | null = null
const variantStore = () => (store ??= createStore('soundix-variants', 'variants'))

/** Stored variants, oldest first; null when storage could not be read. */
export async function loadVariants(): Promise<StoredVariant[] | null> {
  try {
    const all = await values<StoredVariant>(variantStore())
    return all.sort((a, b) => a.added - b.added)
  } catch {
    return null
  }
}

/** Stores a variant; false when storage refused. */
export async function putVariant(variant: StoredVariant): Promise<boolean> {
  try {
    await set(variant.id, variant, variantStore())
    return true
  } catch {
    return false
  }
}

/** Deletes variants; false when storage refused. */
export async function deleteVariants(ids: string[]): Promise<boolean> {
  try {
    await delMany(ids, variantStore())
    return true
  } catch {
    return false
  }
}
