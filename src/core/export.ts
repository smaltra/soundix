import { buildAgentMd } from './agent'
import { resolveEntries, type ExportEntry, type ExportFormat } from './entries'
import { modelById } from './generate'
import { variantsForExport, type VariantForExport } from './project'
import type { UiElement } from './layout'
import { buildSoundixJson } from './soundix-json'
import type { Library, SoundEvent } from './types'

export type { ExportFormat } from './entries'

/** A file of the archive: generated text, a library file or an own sound. */
export type ExportFile = { path: string } & (
  { text: string } | { url: string } | { own: string } | { variant: string }
)

export interface ExportPlan {
  files: ExportFile[]
  /** Events without a sound; soundix.json keeps them with file: null */
  skipped: SoundEvent[]
}

export const SITE_URL = 'https://smaltra.github.io/soundix/'
export const MADE_WITH = `Made with Soundix — ${SITE_URL}`

/** Sounds, soundix.json, CREDITS.txt and AGENT.md: everything an agent needs. */
export function planExport(
  events: SoundEvent[],
  ui: UiElement[],
  library: Library,
  format: ExportFormat,
  ownType?: (id: string) => string | null,
  /** Generated variants to carry along in a project ZIP */
  variants: VariantForExport[] = [],
): ExportPlan {
  const { entries, skipped } = resolveEntries(events, library, format, ownType)
  const extra = variantsForExport(
    variants,
    events.map((e) => e.file),
  )
  const json = buildSoundixJson(events, entries, ui, extra.json)
  const files: ExportFile[] = entries.map((e) => ({ path: e.path, ...e.body }))
  files.push(...extra.files)
  files.push(
    { path: 'soundix.json', text: `${JSON.stringify(json, null, 2)}\n` },
    { path: 'CREDITS.txt', text: buildCredits(entries, library) },
    { path: 'AGENT.md', text: buildAgentMd(json) },
  )
  return { files, skipped }
}

/** Packs whose sounds are in the archive, in library order, then generated sounds. */
export function buildCredits(entries: ExportEntry[], library: Library): string {
  const used = new Set(entries.map((e) => e.pack?.id))
  const blocks = library.packs
    .filter((p) => used.has(p.id))
    .map((p) => `${p.name} — ${p.author}\n${p.url}\nLicense: ${p.license}`)
  const body = blocks.length ? blocks.join('\n\n') : 'No library sounds in this archive.'
  return `Sound credits\n=============\n\n${body}\n\n${generatedCredits(entries)}${MADE_WITH}\n`
}

// Prompts and model names may come from someone else's ZIP: one short line each.
const line = (text: string, max: number) => text.replace(/\s+/g, ' ').trim().slice(0, max)

/** Generated sounds are not CC0: the terms of the service that made them apply. */
function generatedCredits(entries: ExportEntry[]): string {
  const blocks = entries.flatMap(({ path, source }) => {
    if (!source.generated) return []
    const model = modelById(source.generated.model)
    const name = model?.label ?? line(source.generated.model, 80)
    const terms = model ? `\nTerms: ${model.terms ?? model.url}` : ''
    const note = model?.note ? ` (${model.note})` : ''
    return [`${path} — ${name}\nPrompt: ${line(source.generated.prompt, 500)}${terms}${note}`]
  })
  if (!blocks.length) return ''
  const note = 'These sounds are not CC0: the terms of the service that generated each one apply.'
  return `Generated with AI\n-----------------\n\n${blocks.join('\n\n')}\n\n${note}\n\n`
}

const pad = (n: number) => String(n).padStart(2, '0')

export const zipName = (date: Date) =>
  `soundix-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`
