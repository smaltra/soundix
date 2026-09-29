// ElevenLabs sound effects from the browser with the person's key: one request, MP3 back.
import { apiError, isKeyOf, type GenResult, type GenStatus } from '../core/generate'
import { deadline } from './deadline'

const API = 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128'
const HOST = new URL(API).host
const TIMEOUT_MS = 120_000

export async function generateElevenLabs(
  input: object,
  key: string,
  signal: AbortSignal,
  onStatus: (status: GenStatus) => void = () => undefined,
): Promise<GenResult> {
  if (signal.aborted) return { ok: false, error: 'cancelled' }
  // Last line of defence: only a value shaped like an ElevenLabs key ever goes out, as a whole.
  if (!isKeyOf(key, 'elevenlabs')) return { ok: false, error: 'key' }
  const limit = deadline(signal, TIMEOUT_MS)
  let answered = false
  try {
    onStatus({ phase: 'send' })
    const response = await fetch(API, {
      method: 'POST',
      signal: limit.signal,
      cache: 'no-store',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      const body = await response.json().catch((error: unknown) => {
        if (limit.signal.aborted) throw error
        return null
      })
      return {
        ok: false,
        error: apiError(response.status, body),
        diag: `HTTP ${response.status} from ${HOST}`,
      }
    }
    answered = true
    onStatus({ phase: 'download' })
    const blob = await response.blob()
    const contentType = response.headers.get('content-type') ?? 'audio/mpeg'
    return { ok: true, blob, contentType, url: API }
  } catch {
    if (signal.aborted) return { ok: false, error: 'cancelled' }
    const diag = answered ? `the file from ${HOST} broke off` : `no answer from ${HOST}`
    return { ok: false, error: limit.expired() ? 'timeout' : 'network', diag }
  } finally {
    limit.done()
  }
}
