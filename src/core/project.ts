// A project ZIP: the export plus generated variants, and what Soundix reads back from one.
import { extForType } from './generate'
import { isFileName, toFileName } from './names'
import type { Generated, SoundEvent } from './types'

/** Limits for one ZIP: files read, bytes per sound file, of soundix.json and of all sounds. */
export const MAX_ZIP_FILES = 500
export const MAX_ZIP_FILE_BYTES = 10 * 1024 * 1024
export const MAX_ZIP_JSON_BYTES = 2 * 1024 * 1024
export const MAX_ZIP_TOTAL_BYTES = 200 * 1024 * 1024

/** A stored variant as the export needs it. */
export interface VariantForExport {
  id: string
  event: string
  n: number
  /** MIME type of the file */
  type: string
  generated: Generated
  /** Events of the set that play this variant; from the shared pool, not only its own */
  usedBy?: string[]
}

export interface VariantJson {
  event: string
  file: string
  generated: Generated
  usedBy?: string[]
}

const pathOf = (v: VariantForExport) => `variants/${v.event}/${v.n}.${extForType(v.type) || 'mp3'}`

/** Files and soundix.json entries for the variants of the events in the set. */
export function variantsForExport(variants: VariantForExport[], eventIds: string[]) {
  const ids = new Set(eventIds)
  const chosen = variants
    .filter((v) => ids.has(v.event))
    .sort((a, b) => a.event.localeCompare(b.event) || a.n - b.n)
  return {
    files: chosen.map((v) => ({ path: pathOf(v), variant: v.id })),
    json: chosen.map((v): VariantJson => ({
      event: v.event,
      file: pathOf(v),
      generated: v.generated,
      ...(v.usedBy?.length && { usedBy: v.usedBy }),
    })),
  }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** Only files under sounds/ or variants/, without climbing out of them. */
const isPath = (v: unknown): v is string =>
  typeof v === 'string' && /^(sounds|variants)\/[^\\:]{1,200}$/.test(v) && !v.includes('..')

const generatedOf = (g: unknown): Generated | undefined =>
  isObj(g) && typeof g.model === 'string' && typeof g.prompt === 'string'
    ? { model: g.model.slice(0, 100), prompt: g.prompt.slice(0, 500) }
    : undefined

export interface ZipOwn {
  /** Index of the event in soundix.json and in the imported events */
  index: number
  path: string
  name: string
  generated?: Generated
}

export interface ZipVariant {
  /** The event id after import */
  event: string
  path: string
  generated: Generated
  /** Events that play this variant, by their ids after import */
  usedBy?: string[]
}

/**
 * Own sound files and variants a project soundix.json names. `events` are the imported events in
 * the same order, so an id the import cleaned ("_tap" → tap) still finds its event.
 */
export function zipContents(
  json: unknown,
  events: Pick<SoundEvent, 'file'>[],
): { own: ZipOwn[]; variants: ZipVariant[] } {
  const data = isObj(json) ? json : {}
  const list = Array.isArray(data.events) ? data.events : []
  const ids = new Map<string, string>()
  list.forEach((e, i) => {
    if (isObj(e) && typeof e.id === 'string' && events[i] && !ids.has(e.id)) {
      ids.set(e.id, events[i].file)
    }
  })

  const own = list.flatMap((e, index): ZipOwn[] => {
    if (!isObj(e) || !isObj(e.source) || e.source.own !== true || !isPath(e.file)) return []
    const original = typeof e.source.original === 'string' ? e.source.original : ''
    const name = (original || e.file.split('/').pop() || 'sound').slice(0, 120)
    const generated = generatedOf(e.source.generated)
    return [{ index, path: e.file, name, ...(generated && { generated }) }]
  })

  const variants = (Array.isArray(data.variants) ? data.variants : []).flatMap(
    (v): ZipVariant[] => {
      if (!isObj(v) || typeof v.event !== 'string' || !isFileName(v.event) || !isPath(v.file)) {
        return []
      }
      const generated = generatedOf(v.generated)
      if (!generated || !v.file.startsWith('variants/')) return []
      const event = ids.get(v.event) ?? toFileName(v.event)
      const idOf = (id: string) => ids.get(id) ?? toFileName(id)
      // A ZIP from before usedBy says only "used": then its own event plays it.
      const usedBy = Array.isArray(v.usedBy)
        ? v.usedBy
            .filter((id): id is string => typeof id === 'string' && isFileName(id))
            .slice(0, 50)
            .map(idOf)
        : v.used === true
          ? [event]
          : []
      return [{ event, path: v.file, generated, ...(usedBy.length > 0 && { usedBy }) }]
    },
  )

  const kept = own.slice(0, MAX_ZIP_FILES)
  return { own: kept, variants: variants.slice(0, MAX_ZIP_FILES - kept.length) }
}
