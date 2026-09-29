// Sound generation on fal.ai or ElevenLabs with the person's own key: models, inputs, file
// names, errors and a small task queue.
import { extForType, extOf, typeForPath } from './audio-types'
import type { SoundEvent } from './types'

export { extForType, typeForPath } from './audio-types'

export type Provider = 'fal' | 'elevenlabs'

// In the order the dialog shows them.
export const PROVIDERS: Record<Provider, { label: string; keyName: string; keyUrl: string }> = {
  elevenlabs: {
    label: 'ElevenLabs',
    keyName: 'ElevenLabs key',
    keyUrl: 'https://elevenlabs.io/app/settings/api-keys',
  },
  fal: { label: 'fal.ai', keyName: 'fal key', keyUrl: 'https://fal.ai/dashboard/keys' },
}

export interface GenModel {
  /** fal endpoint id, or elevenlabs:<model_id> */
  id: string
  provider: Provider
  label: string
  /** Page with the price */
  url: string
  /** Terms for CREDITS.txt when they are not on the model page */
  terms?: string
  /** A caveat shown next to the model and in CREDITS.txt */
  note?: string
  /** The model takes prompt_influence: how closely it follows the prompt, 0..1 */
  influence?: boolean
  input: (prompt: string, seconds: number, influence: number) => Record<string, unknown>
}

export const GEN_MODELS: GenModel[] = [
  {
    id: 'elevenlabs:eleven_text_to_sound_v2',
    provider: 'elevenlabs',
    label: 'ElevenLabs SFX v2 — direct',
    url: 'https://elevenlabs.io/pricing',
    terms: 'https://elevenlabs.io/terms-of-use',
    note: 'commercial use depends on your ElevenLabs plan',
    influence: true,
    input: (prompt, seconds, influence) => ({
      text: prompt,
      duration_seconds: seconds,
      prompt_influence: influence,
      model_id: 'eleven_text_to_sound_v2',
    }),
  },
  {
    id: 'fal-ai/elevenlabs/sound-effects/v2',
    provider: 'fal',
    label: 'ElevenLabs SFX v2 — via fal.ai',
    url: 'https://fal.ai/models/fal-ai/elevenlabs/sound-effects/v2',
    influence: true,
    input: (prompt, seconds, influence) => ({
      text: prompt,
      duration_seconds: seconds,
      prompt_influence: influence,
      output_format: 'mp3_44100_128',
    }),
  },
  {
    id: 'fal-ai/stable-audio-3/small/sfx/text-to-audio',
    provider: 'fal',
    label: 'Stable Audio 3 SFX',
    url: 'https://fal.ai/models/fal-ai/stable-audio-3/small/sfx/text-to-audio',
    input: (prompt, seconds) => ({ prompt, duration: seconds, output_format: 'ogg' }),
  },
]

export const MIN_SECONDS = 0.5
export const MAX_SECONDS = 5
export const DEFAULT_SECONDS = 1
export const MAX_VARIANTS = 10
/** ElevenLabs' own default for prompt_influence */
export const DEFAULT_INFLUENCE = 0.3

export const modelById = (id: string) => GEN_MODELS.find((m) => m.id === id)

/** The first model of a service whose key is at hand, else the first model. */
export const defaultModel = (hasKey: (p: Provider) => boolean) =>
  GEN_MODELS.find((m) => hasKey(m.provider)) ?? GEN_MODELS[0]

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** A starting prompt: the event name and up to three of its search words. */
export function promptFor(event: Pick<SoundEvent, 'name' | 'file' | 'words'>): string {
  const name = event.name.trim() || event.file
  const like = event.words.slice(0, 3)
  const hint = like.length ? ` (${like.join(', ')})` : ''
  return `Short game interface sound: ${name}${hint}. Clean, no music, no voices.`
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** The model input; length rounded to 0.1 s and influence to 0.05, both kept in range. */
export function inputFor(
  model: GenModel,
  prompt: string,
  seconds: number,
  influence = DEFAULT_INFLUENCE,
) {
  const s = Math.round(clamp(seconds, MIN_SECONDS, MAX_SECONDS) * 10) / 10
  const i = Math.round(clamp(influence, 0, 1) * 20) / 20
  return model.input(prompt.trim(), s, i)
}

/**
 * A pasted key without what people copy along with it: `export`, NAME= or "NAME": in front,
 * quotes, a trailing comma, spaces and line breaks.
 */
export function cleanKey(raw: string): string {
  return raw
    .trim()
    .replace(/^export\s+/, '')
    .replace(/^["']?[A-Za-z_][A-Za-z0-9_]*["']?\s*[=:]\s*/, '')
    .replace(/,$/, '')
    .replace(/^(["'`])(.*)\1$/s, '$2')
    .replace(/\s+/g, '')
}

// ElevenLabs: sk_ + hex, maybe with a region suffix; older keys are 32 hex. fal: <uuid>:<secret>.
const ELEVENLABS_KEY = /^(sk_[0-9a-f]{20,}(_residency_[a-z0-9]+)?|[0-9a-f]{32})$/i
const FAL_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-z]{16,}$/i

/** Which service a key belongs to by the shape of the whole value, as it is; null for neither. */
function detectKey(key: string): Provider | null {
  if (ELEVENLABS_KEY.test(key)) return 'elevenlabs'
  if (FAL_KEY.test(key)) return 'fal'
  return null
}

/** Which service a pasted key belongs to, by its shape once cleaned; null when it fits neither. */
export const keyService = (raw: string) => detectKey(cleanKey(raw))

/** The last check before sending: the exact value has the shape of that service's key. */
export const isKeyOf = (key: string, provider: Provider) => detectKey(key) === provider

/**
 * Whether a key may go to a service, and in what form. Only a key of that service's own shape is
 * sent: a key of the other service or of no known shape goes nowhere.
 */
export function keyFor(
  raw: string,
  provider: Provider,
):
  | { ok: true; key: string }
  | { ok: false; reason: 'empty' | 'unknown' }
  | { ok: false; reason: 'other'; owner: Provider } {
  const key = cleanKey(raw)
  if (!key) return { ok: false, reason: 'empty' }
  // The string checked is the string sent: cleaning twice could hide a prefix that goes out.
  const owner = detectKey(key)
  if (owner === provider) return { ok: true, key }
  return owner ? { ok: false, reason: 'other', owner } : { ok: false, reason: 'unknown' }
}

/** Both models answer { audio: { url } }. */
export function audioUrlOf(output: unknown): string | null {
  const audio = isObj(output) ? output.audio : null
  return isObj(audio) && typeof audio.url === 'string' ? audio.url : null
}

/** A result's extension: from its MIME type, else from its URL, else mp3. */
export const resultExt = (contentType: string, url: string) =>
  extForType(contentType) || extOf(url.split('?')[0]) || 'mp3'

/** A MIME type Soundix knows for a result, so its file keeps the right extension later. */
export const resultType = (contentType: string, url: string) =>
  typeForPath(`sound.${resultExt(contentType, url)}`) || 'audio/mpeg'

/** name.ext, then name-2.ext, name-3.ext… among the names taken. */
export function uniqueSoundName(name: string, taken: string[]): string {
  const used = new Set(taken)
  if (!used.has(name)) return name
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let n = 2; ; n++) {
    const next = `${base}-${n}${ext}`
    if (!used.has(next)) return next
  }
}

/** <event>-ai.<ext>, then -ai-2, -ai-3… among the names My sounds already has. */
export function generatedName(
  eventFile: string,
  taken: string[],
  contentType: string,
  url: string,
): string {
  return uniqueSoundName(`${eventFile}-ai.${resultExt(contentType, url)}`, taken)
}

export type GenError =
  'key' | 'balance' | 'input' | 'busy' | 'network' | 'timeout' | 'failed' | 'bad-audio'

// Nothing a service sends is ever shown: no text, no value. Messages are ours, picked by
// category from the HTTP status and the body, which is read here and goes no further.

/** Where one request is, for the progress line */
export type GenStatus =
  | { phase: 'send' }
  | { phase: 'queue'; position: number | null }
  | { phase: 'running' }
  | { phase: 'download' }

export type FalState =
  | Extract<GenStatus, { phase: 'queue' | 'running' }>
  | { phase: 'done'; failed: boolean }
  | { phase: 'unknown' }

/** Requests ahead in the queue, shown only as a small whole number; anything else is not shown. */
export function queuePosition(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 999
    ? (value as number)
    : null
}

/** A fal queue status. A failure is COMPLETED with an error; anything else is unexpected. */
export function falState(body: unknown): FalState {
  const field = (name: string) => (isObj(body) ? body[name] : undefined)
  const status = field('status')
  if (status === 'IN_QUEUE')
    return { phase: 'queue', position: queuePosition(field('queue_position')) }
  if (status === 'IN_PROGRESS') return { phase: 'running' }
  if (status === 'COMPLETED') return { phase: 'done', failed: !!field('error') }
  return { phase: 'unknown' }
}

/** The reason in "detail": a string, a list of { msg } or (ElevenLabs) { message }; read only. */
function detailOf(body: unknown): string {
  const detail = isObj(body) ? body.detail : body
  return typeof detail === 'string'
    ? detail
    : Array.isArray(detail)
      ? detail.map((d) => (isObj(d) && typeof d.msg === 'string' ? d.msg : '')).join('; ')
      : isObj(detail) && typeof detail.message === 'string'
        ? detail.message
        : ''
}

/** Why fal or ElevenLabs refused a request, from the HTTP status and its body. */
export function apiError(status: number, body: unknown): GenError {
  if (status === 402 || /balance|credit|billing|quota/i.test(detailOf(body))) return 'balance'
  if (status === 401 || status === 403) return 'key'
  if (status === 422) return 'input'
  if (status === 429) return 'busy'
  return 'network'
}

export type GenResult =
  | { ok: true; blob: Blob; contentType: string; url: string }
  | {
      ok: false
      error: GenError | 'cancelled'
      /** Our step, the HTTP code and our name of the host, for diagnosis; nothing from a body */
      diag?: string
    }

/** Runs tasks with at most `limit` at a time; after an abort no new task starts. */
export async function runLimited<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  signal?: AbortSignal,
): Promise<(T | undefined)[]> {
  const results: (T | undefined)[] = new Array(tasks.length).fill(undefined)
  let next = 0
  const worker = async () => {
    while (next < tasks.length && !signal?.aborted) {
      const i = next++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}
