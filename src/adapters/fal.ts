// The fal.ai queue from the browser with the person's key: submit, wait, fetch the file.
import {
  apiError,
  audioUrlOf,
  falState,
  isKeyOf,
  queuePosition,
  type FalState,
  type GenError,
  type GenResult,
  type GenStatus,
} from '../core/generate'
import { deadline } from './deadline'

const QUEUE = 'https://queue.fal.run'
// Hosts are named by us, never taken from a response.
const QUEUE_HOST = 'queue.fal.run'
const FILE_HOST = 'the file host'
const POLL_MS = 1000
const TIMEOUT_MS = 120_000

interface Queued {
  status_url: string
  response_url: string
  cancel_url: string
  queue_position?: unknown
}

/** A refused step: the category, and our step, HTTP code and host for diagnosis. */
type Refusal = { error: GenError; diag: string }
const isRefusal = (e: unknown): e is Refusal =>
  !!e && typeof e === 'object' && typeof (e as Refusal).error === 'string'

type Step = 'submit' | 'status' | 'result' | 'file'

// The key is only ever sent to the queue host, whatever URLs a response names.
const onQueue = (url: string) => {
  try {
    return new URL(url).origin === QUEUE
  } catch {
    return false
  }
}

/**
 * A fetch that tells which step got no answer. Never from the HTTP cache: a status polled once a
 * second must be the current one, not a stored IN_QUEUE.
 */
async function send(
  step: Step,
  host: string,
  url: string,
  signal: AbortSignal,
  init: RequestInit = {},
) {
  try {
    return await fetch(url, { ...init, signal, cache: 'no-store' })
  } catch (error) {
    if (signal.aborted) throw error
    throw { error: 'network', diag: `${step}: no answer from ${host}` } satisfies Refusal
  }
}

/** The parsed answer of the queue, and its HTTP code for diagnosis. */
async function call(
  step: Step,
  url: string,
  key: string,
  signal: AbortSignal,
  init: RequestInit = {},
): Promise<{ body: unknown; from: string }> {
  if (!onQueue(url)) {
    throw { error: 'network', diag: `${step}: an address off the queue` } satisfies Refusal
  }
  const response = await send(step, QUEUE_HOST, url, signal, {
    ...init,
    headers: { ...init.headers, Authorization: `Key ${key}` },
  })
  // A body that stalls until Cancel or the time limit is not "no body": that error goes on.
  const body = await response.json().catch((error: unknown) => {
    if (signal.aborted) throw error
    return null
  })
  const from = `HTTP ${response.status} from ${QUEUE_HOST}`
  if (!response.ok) {
    throw { error: apiError(response.status, body), diag: `${step}: ${from}` } satisfies Refusal
  }
  return { body, from }
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })

function cancel(queued: Queued, key: string) {
  if (!onQueue(queued.cancel_url)) return
  fetch(queued.cancel_url, {
    method: 'PUT',
    cache: 'no-store',
    headers: { Authorization: `Key ${key}` },
  }).catch(() => undefined)
}

/** Where the request was last seen, in our words, for a message after the time limit */
const lastStatus = (state: FalState) =>
  state.phase === 'queue'
    ? `IN_QUEUE${state.position === null ? '' : `, ${state.position} ahead`}`
    : state.phase === 'running'
      ? 'IN_PROGRESS'
      : state.phase === 'unknown'
        ? 'an unexpected status'
        : 'COMPLETED, fetching the result'

/** Generates one sound. Aborting the signal cancels the request on fal too. */
export async function generateOnFal(
  modelId: string,
  input: object,
  key: string,
  signal: AbortSignal,
  onStatus: (status: GenStatus) => void = () => undefined,
): Promise<GenResult> {
  if (signal.aborted) return { ok: false, error: 'cancelled' }
  // Last line of defence: only a value shaped like a fal key ever goes out, as a whole.
  if (!isKeyOf(key, 'fal')) return { ok: false, error: 'key' }
  // One time limit for the whole chain: submit, every poll, the result and the file.
  const limit = deadline(signal, TIMEOUT_MS)
  let queued: Queued | null = null
  let last = 'no answer to submit'
  try {
    onStatus({ phase: 'send' })
    const submitted = await call('submit', `${QUEUE}/${modelId}`, key, limit.signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    queued = submitted.body as Queued
    onStatus({ phase: 'queue', position: queuePosition(queued.queue_position) })
    last = 'submitted, no status yet'
    for (;;) {
      const answer = await call('status', queued.status_url, key, limit.signal)
      const state = falState(answer.body)
      last = lastStatus(state)
      if (state.phase === 'done') {
        if (state.failed) return { ok: false, error: 'failed', diag: `status: ${answer.from}` }
        break
      }
      // An answer the queue does not document would be waited on in silence: it fails at once.
      if (state.phase === 'unknown') {
        cancel(queued, key)
        return { ok: false, error: 'failed', diag: `status: ${answer.from}, unexpected status` }
      }
      onStatus(state)
      await wait(POLL_MS, limit.signal)
    }
    onStatus({ phase: 'download' })
    const url = audioUrlOf((await call('result', queued.response_url, key, limit.signal)).body)
    if (!url) return { ok: false, error: 'failed', diag: 'result: no audio file in it' }
    const file = await send('file', FILE_HOST, url, limit.signal) // a public file: no key
    if (!file.ok) {
      return { ok: false, error: 'network', diag: `file: HTTP ${file.status} from ${FILE_HOST}` }
    }
    const blob = await file.blob()
    return { ok: true, blob, contentType: file.headers.get('content-type') ?? blob.type, url }
  } catch (e) {
    if (signal.aborted || limit.expired()) {
      if (queued) cancel(queued, key)
      if (signal.aborted) return { ok: false, error: 'cancelled' }
      return { ok: false, error: 'timeout', diag: `after ${TIMEOUT_MS / 1000} s: ${last}` }
    }
    return isRefusal(e)
      ? { ok: false, ...e }
      : { ok: false, error: 'network', diag: `after ${last}` }
  } finally {
    limit.done()
  }
}
