// Opening a project ZIP: the set as with a JSON import, plus the own sounds and variants it carries.
import { openZip } from '../adapters/zip'
import { decodeBlob } from '../audio/player'
import type { UiElement } from '../core/layout'
import { zipContents, type ZipOwn } from '../core/project'
import { parseSoundixJson, type ImportError } from '../core/soundix-json'
import type { SoundEvent, SoundRef } from '../core/types'
import type { StoredOwnSound } from '../storage/own-sounds'
import type { Copies, OwnSounds, Variants, VariantCopy } from './hooks'

export type ProjectError = ImportError | 'bad-zip' | 'no-json'

export type ProjectResult =
  | {
      ok: true
      events: SoundEvent[]
      ui: UiElement[]
      own: number
      variants: number
      /** Own sounds and variants that storage refused */
      refused: number
    }
  | { ok: false; error: ProjectError }

export const isZipFile = (f: File) =>
  /\.zip$/i.test(f.name) ||
  f.type === 'application/zip' ||
  f.type === 'application/x-zip-compressed'

export async function importProject(
  file: Blob,
  current: SoundEvent[],
  own: OwnSounds,
  variants: Variants,
  copies: Copies,
): Promise<ProjectResult> {
  let zip: Awaited<ReturnType<typeof openZip>>
  try {
    zip = await openZip(file)
  } catch {
    return { ok: false, error: 'bad-zip' }
  }
  if (!zip) return { ok: false, error: 'no-json' }
  const opened = zip
  // A damaged file inside the archive is skipped, never thrown out of the import.
  const read = (path: string) => opened.sound(path).catch(() => null)
  const parsed = parseSoundixJson(zip.json, current)
  if (!parsed.ok) return parsed
  const contents = zipContents(JSON.parse(zip.json), parsed.events)

  const events = [...parsed.events]
  const ownOf = new Map(contents.own.map((o) => [events[o.index]?.file, o]))

  // A variant an event plays shows before its copy is stored. Until then a Use of it waits for
  // this copy through the shared copies lock instead of making a second one.
  const holds = new Map<string, (copy: VariantCopy) => void>()
  const hold = (id: string) =>
    void copies.run(id, () => new Promise<VariantCopy>((resolve) => holds.set(id, resolve)))
  const release = (id: string, copy: VariantCopy) => {
    holds.get(id)?.(copy)
    holds.delete(id)
  }

  try {
    // Variants first, so a copy in My sounds is born naming the variant it came from.
    let variantsAdded = 0
    let refused = 0
    const variantOf = new Map<string, string>()
    const stored: { id: string; usedBy: string[] }[] = []
    for (const item of contents.variants) {
      const blob = await read(item.path)
      if (!blob) continue
      let duration: number
      try {
        duration = Math.round((await decodeBlob(blob)).duration * 100) / 100
      } catch {
        continue // This browser cannot play it: skipped.
      }
      const variant = await variants.add({
        event: item.event,
        blob,
        duration,
        generated: item.generated,
      })
      if (!variant) {
        refused++
        continue
      }
      variantsAdded++
      const usedBy = item.usedBy ?? []
      if (usedBy.some((file) => ownOf.has(file))) hold(variant.id)
      stored.push({ id: variant.id, usedBy })
      for (const file of usedBy) if (!variantOf.has(file)) variantOf.set(file, variant.id)
    }

    // Own sounds go to My sounds and replace the "missing" the JSON import leaves.
    const copyFor = new Map<string, StoredOwnSound>()
    const setCopy = (file: string, sound: StoredOwnSound) => {
      copyFor.set(file, sound)
      const index = events.findIndex((e) => e.file === file)
      const generated = sound.generated && { generated: sound.generated }
      const ref: SoundRef = { kind: 'own', id: sound.id, name: sound.name, ...generated }
      if (index >= 0) events[index] = { ...events[index], sound: ref }
    }
    /** The stored sound; null when it cannot be read or played */
    const addOwn = async (item: ZipOwn, variant?: string) => {
      const blob = await read(item.path)
      const sound = blob && (await own.addBlob(blob, item.name, item.generated, variant))
      return !sound || sound === 'unplayable' ? null : sound
    }
    let ownAdded = 0
    const handled = new Set<string>()

    // Events that play one variant share one copy, as they did before export: the first of their
    // files, in usedBy order, that this browser can play.
    for (const item of contents.variants) {
      const group = (item.usedBy ?? []).filter((id) => ownOf.has(id) && !handled.has(id))
      if (group.length < 2) continue
      let copy: StoredOwnSound | null = null
      let wasRefused = false
      for (const id of group) {
        const added = await addOwn(ownOf.get(id)!, variantOf.get(id))
        if (added === 'refused') wasRefused = true
        else if (added) {
          copy = added
          break
        }
      }
      if (copy) ownAdded++
      else if (wasRefused) refused++
      for (const id of group) {
        handled.add(id)
        if (copy) setCopy(id, copy)
      }
    }

    for (const item of contents.own) {
      const file = events[item.index].file
      if (handled.has(file)) continue
      const copy = await addOwn(item, variantOf.get(file))
      if (copy === 'refused') refused++
      if (!copy || copy === 'refused') continue
      setCopy(file, copy)
      ownAdded++
    }

    for (const { id, usedBy } of stored) {
      const copy = usedBy.map((file) => copyFor.get(file)).find((s) => s !== undefined)
      // A Use waiting for this variant gets the copy now, or makes its own if there is none.
      release(id, copy ? { sound: copy, note: '' } : null)
      // The link on the variant's side as well. The copy already names its variant, so a refusal
      // here loses nothing and is not counted.
      if (copy) await variants.markSaved(id, copy.id)
    }
    return { ok: true, events, ui: parsed.ui, own: ownAdded, variants: variantsAdded, refused }
  } finally {
    // Whatever stopped the import, no Use waits forever.
    for (const id of [...holds.keys()]) release(id, null)
  }
}
