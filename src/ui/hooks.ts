import { useCallback, useEffect, useRef, useState } from 'react'
import { libraryUrl } from '../adapters/zip'
import { decodeBlob, forgetBuffer } from '../audio/player'
import { uniqueSoundName } from '../core/generate'
import { serialRecords, type SharedRuns } from '../core/serial'
import type { Generated, Library, LibraryPack, LibrarySound } from '../core/types'
import {
  deleteOwnSound,
  loadOwnSounds,
  putOwnSound,
  type StoredOwnSound,
} from '../storage/own-sounds'
import { deleteVariants, loadVariants, putVariant, type StoredVariant } from '../storage/variants'

export interface LibraryData {
  status: 'loading' | 'ready' | 'error'
  library: Library
  sounds: Map<string, LibrarySound>
  packs: Map<string, LibraryPack>
}

const EMPTY: Library = { version: 1, packs: [], sounds: [] }

function indexed(library: Library, status: LibraryData['status']): LibraryData {
  return {
    status,
    library,
    sounds: new Map(library.sounds.map((s) => [s.id, s])),
    packs: new Map(library.packs.map((p) => [p.id, p])),
  }
}

export function useLibraryData(): LibraryData {
  const [data, setData] = useState(() => indexed(EMPTY, 'loading'))
  useEffect(() => {
    fetch(libraryUrl('library.json'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((library: Library) => setData(indexed(library, 'ready')))
      .catch(() => setData(indexed(EMPTY, 'error')))
  }, [])
  return data
}

// Every storage write below follows two rules, so overlapping changes never undo each other:
// 1. A record is written only inside records.run(id). A new one is born there and shows after the
//    write worked; a change is a patch to its current version, read inside the queue.
// 2. Every write says whether it worked. A refusal fails the operation, and the person is told.

/** Why a sound did not get into My sounds */
export type NotAdded = 'unplayable' | 'refused'

export interface OwnSounds {
  /** Storage was read; until then (or if reading failed) own sounds in the set are left alone */
  ready: boolean
  list: StoredOwnSound[]
  /**
   * Adds playable files, each stored before it shows. `failed`: files the browser cannot play;
   * `refused`: files storage refused.
   */
  add: (files: File[]) => Promise<{ added: number; failed: string[]; refused: string[] }>
  /**
   * Adds a sound file (generated or from a project ZIP), stored before it shows. `variant`: the
   * variant it is a copy of, stored with it.
   */
  addBlob: (
    blob: Blob,
    name: string,
    generated?: Generated,
    variant?: string,
  ) => Promise<StoredOwnSound | NotAdded>
  /**
   * Swaps the file of a sound (for its mono copy); the name is made unique among the rest.
   * Null when storage refused or the sound was deleted: then nothing changes.
   */
  replaceBlob: (id: string, blob: Blob, name: string) => Promise<StoredOwnSound | null>
  /** Deletes a sound at once in this tab; false when storage could not delete it */
  remove: (id: string) => Promise<boolean>
  /** Deleted in this tab, even if storage has not answered yet */
  isGone: (id: string) => boolean
}

const newOwnId = () => `own:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

async function readOwnSound(file: File): Promise<StoredOwnSound | null> {
  try {
    const buffer = await decodeBlob(file)
    return {
      id: newOwnId(),
      name: file.name,
      type: file.type,
      duration: Math.round(buffer.duration * 100) / 100,
      blob: file,
      added: Date.now(),
    }
  } catch {
    return null
  }
}

export function useOwnSoundsData(): OwnSounds {
  const [list, setList] = useState<StoredOwnSound[]>([])
  const [ready, setReady] = useState(false)
  // Saves can overlap; names are picked from this mirror, which never lags behind a render.
  const latest = useRef<StoredOwnSound[]>([])
  const update = useCallback((fn: (prev: StoredOwnSound[]) => StoredOwnSound[]) => {
    latest.current = fn(latest.current)
    setList(latest.current)
  }, [])
  // Changes to one sound run one at a time; a deleted sound is known at once.
  const records = useRef(serialRecords()).current
  // Names being written right now, so two saves at once never take the same name.
  const reserved = useRef(new Set<string>()).current
  const namesBut = (id?: string) => [
    ...latest.current.filter((s) => s.id !== id).map((s) => s.name),
    ...reserved,
  ]

  // Read once, even when React runs effects twice. Adding waits for it, so new sounds come after
  // the stored ones and their names are unique among them.
  const loaded = useRef<Promise<void> | null>(null)
  const load = useCallback(
    () =>
      (loaded.current ??= loadOwnSounds().then((stored) => {
        if (!stored) return
        update(() => stored)
        setReady(true)
      })),
    [update],
  )
  useEffect(() => void load(), [load])

  /** A new sound: nobody knows its id yet, so it is written whole and shows only after that. */
  const store = useCallback(
    async (sound: StoredOwnSound): Promise<StoredOwnSound | 'refused'> => {
      reserved.add(sound.name)
      try {
        if (!(await records.run(sound.id, () => putOwnSound(sound)))) return 'refused'
        update((prev) => [...prev, sound])
        return sound
      } finally {
        reserved.delete(sound.name)
      }
    },
    [update, records, reserved],
  )

  const add = useCallback(
    async (files: File[]) => {
      await load()
      const failed: string[] = []
      const refused: string[] = []
      let added = 0
      for (const file of files) {
        const sound = await readOwnSound(file)
        if (!sound) failed.push(file.name)
        else if ((await store(sound)) === 'refused') refused.push(file.name)
        else added++
      }
      return { added, failed, refused }
    },
    [load, store],
  )

  const addBlob = useCallback(
    async (blob: Blob, name: string, generated?: Generated, variant?: string) => {
      await load()
      const sound = await readOwnSound(new File([blob], name, { type: blob.type }))
      if (!sound) return 'unplayable'
      const unique = uniqueSoundName(name, namesBut())
      return store({
        ...sound,
        name: unique,
        ...(generated && { generated }),
        ...(variant && { variant }),
      })
    },
    [load, store],
  )

  const replaceBlob = useCallback(
    (id: string, blob: Blob, name: string) =>
      records.run(id, async () => {
        const sound = latest.current.find((s) => s.id === id)
        if (!sound || records.isBuried(id)) return null
        const patch = { blob, type: blob.type, name: uniqueSoundName(name, namesBut(id)) }
        reserved.add(patch.name)
        try {
          if (!(await putOwnSound({ ...sound, ...patch }))) return null
        } finally {
          reserved.delete(patch.name)
        }
        // Deleted while it was written: the delete queued after this removes it from storage.
        if (records.isBuried(id)) return null
        update((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
        forgetBuffer(id)
        return { ...sound, ...patch }
      }),
    [update, records, reserved],
  )

  const remove = useCallback(
    (id: string) => {
      // Gone at once: changes still waiting for storage see it and refuse.
      records.bury(id)
      forgetBuffer(id)
      update((prev) => prev.filter((s) => s.id !== id))
      return records.run(id, () => deleteOwnSound(id))
    },
    [update, records],
  )

  const isGone = useCallback((id: string) => records.isBuried(id), [records])

  return { ready, list, add, addBlob, replaceBlob, remove, isGone }
}

export type NewVariant = Pick<StoredVariant, 'event' | 'blob' | 'duration' | 'generated'>

/** A copy of a variant in My sounds, with a note for the person; null when none was made */
export type VariantCopy = { sound: StoredOwnSound; note: string } | null

/** One copy per variant: while a Use or an import makes it, everyone else waits for that one. */
export type Copies = SharedRuns<VariantCopy>

export interface Variants {
  /** All stored variants, oldest first */
  list: StoredVariant[]
  /**
   * Stores a variant, then shows it; its number continues after the highest one of its event.
   * Null when storage refused.
   */
  add: (variant: NewVariant) => Promise<StoredVariant | null>
  /**
   * Links a variant to its copy in My sounds and, when given, swaps its file for the mono one,
   * in one write. False when storage refused or the variant was deleted.
   */
  markSaved: (id: string, savedId: string, blob?: Blob) => Promise<boolean>
  /** Swaps the file of a variant (for its mono copy); false when storage refused or deleted */
  replaceBlob: (id: string, blob: Blob) => Promise<boolean>
  /** Deletes a variant at once in this tab; resolves to how many storage could not delete */
  remove: (id: string) => Promise<number>
  /** Deletes the variants of one event, or all of them; resolves like remove */
  clear: (event?: string) => Promise<number>
}

const newVariantId = () => `v:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export function useVariantsData(): Variants {
  const [list, setList] = useState<StoredVariant[]>([])
  // Parallel generations add at once; numbers come from this mirror, not from a stale render.
  const latest = useRef<StoredVariant[]>([])
  const update = useCallback((next: StoredVariant[]) => {
    latest.current = next
    setList(next)
  }, [])
  // Changes to one variant run one at a time; a deleted variant is known at once.
  const records = useRef(serialRecords()).current
  // Numbers of variants being written right now, so parallel results never share one.
  const reserved = useRef<Pick<StoredVariant, 'event' | 'n'>[]>([])

  // Read once, even when React runs effects twice. Adding waits for it, so numbers continue
  // after the stored ones and nothing has to be renumbered.
  const loaded = useRef<Promise<void> | null>(null)
  const load = useCallback(
    () =>
      (loaded.current ??= loadVariants().then((stored) => {
        if (stored) update(stored)
      })),
    [update],
  )
  useEffect(() => void load(), [load])

  /**
   * One change to a stored variant: a patch to its current version, written inside its queue,
   * shown only after the write worked, refused for a variant deleted before or during it.
   */
  const change = useCallback(
    (id: string, patch: Partial<StoredVariant>) =>
      records.run(id, async () => {
        const variant = latest.current.find((v) => v.id === id)
        if (!variant || records.isBuried(id)) return false
        if (!(await putVariant({ ...variant, ...patch }))) return false
        if (records.isBuried(id)) return false
        update(latest.current.map((v) => (v.id === id ? { ...v, ...patch } : v)))
        if (patch.blob) forgetBuffer(id)
        return true
      }),
    [update, records],
  )

  const add = useCallback(
    async (variant: NewVariant) => {
      await load()
      const numbers = [...latest.current, ...reserved.current]
        .filter((v) => v.event === variant.event)
        .map((v) => v.n)
      const stored = {
        ...variant,
        id: newVariantId(),
        n: Math.max(0, ...numbers) + 1,
        added: Date.now(),
      }
      const slot = { event: stored.event, n: stored.n }
      reserved.current.push(slot)
      try {
        // A new id nobody knows yet: written whole, shown only after that worked.
        if (!(await records.run(stored.id, () => putVariant(stored)))) return null
        update([...latest.current, stored])
        return stored
      } finally {
        reserved.current = reserved.current.filter((s) => s !== slot)
      }
    },
    [load, update, records],
  )

  const markSaved = useCallback(
    (id: string, savedId: string, blob?: Blob) => change(id, { savedId, ...(blob && { blob }) }),
    [change],
  )

  const replaceBlob = useCallback((id: string, blob: Blob) => change(id, { blob }), [change])

  const removeMany = useCallback(
    async (gone: (v: StoredVariant) => boolean) => {
      const ids = latest.current.filter(gone).map((v) => v.id)
      // Gone at once: changes still waiting for storage see it and refuse.
      for (const id of ids) {
        records.bury(id)
        forgetBuffer(id)
      }
      update(latest.current.filter((v) => !gone(v)))
      const done = await Promise.all(ids.map((id) => records.run(id, () => deleteVariants([id]))))
      return done.filter((ok) => !ok).length
    },
    [update, records],
  )

  const remove = useCallback((id: string) => removeMany((v) => v.id === id), [removeMany])
  const clear = useCallback(
    (event?: string) => removeMany((v) => event === undefined || v.event === event),
    [removeMany],
  )

  return { list, add, markSaved, replaceBlob, remove, clear }
}
