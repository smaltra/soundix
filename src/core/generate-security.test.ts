import { expect, it, vi } from 'vitest'
import { generateOnFal } from '../adapters/fal'
import { generateElevenLabs } from '../adapters/elevenlabs'
import { generate } from '../adapters/generate'
import { falState, GEN_MODELS } from './generate'

it('keeps credentials out of diagnostics, including truncated service errors', async () => {
  // Synthetic credentials only. Every request, including cancellation, stays in this stub.
  const falKey = '00000000-0000-4000-8000-000000000000:' + 'ab12'.repeat(8)
  const elevenKey = 'sk_' + 'ab12'.repeat(12)
  const queued = {
    status_url: 'https://queue.fal.run/review/requests/test/status',
    response_url: 'https://queue.fal.run/review/requests/test',
    cancel_url: 'https://queue.fal.run/review/requests/test/cancel',
  }
  const exposed: boolean[] = []
  try {
    for (const response of [
      { status: falKey },
      { status: 'COMPLETED', error: 'x'.repeat(140) + falKey },
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
          Response.json(init?.method === 'POST' ? queued : init?.method === 'PUT' ? {} : response),
        ),
      )
      const result = await generateOnFal('fal-ai/review', {}, falKey, new AbortController().signal)
      const message = result.ok ? '' : JSON.stringify(result)
      // Check the secret part too: cutting a key before redaction must not expose its prefix.
      exposed.push(message.includes(falKey) || message.includes(falKey.slice(37, 53)))
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ detail: { message: `Rejected ${elevenKey}` } }, { status: 422 }),
      ),
    )
    const result = await generateElevenLabs({}, elevenKey, new AbortController().signal)
    exposed.push(!result.ok && JSON.stringify(result).includes(elevenKey))
  } finally {
    vi.unstubAllGlobals()
  }

  // Report booleans, never credentials, if the regression fails.
  expect(exposed).toEqual([false, false, false])
})

it('rejects recoverable key representations outside the escape list', async () => {
  // SNDX-57: only a synthetic key; no HTTP request leaves this stub.
  const key = 'sk_0123456789abcdef0123456789abcdef'
  const fullwidth = [...key]
    .map((c) => (/[a-z0-9]/i.test(c) ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c))
    .join('')
  const base64 = btoa(key)
    .match(/.{1,8}/g)!
    .join(' ')
  const hex = [...key].map((c) => c.charCodeAt(0).toString(16)).join(' ')
  const cases: [string, (text: string) => string][] = [
    [fullwidth, (text) => text.normalize('NFKC')],
    [base64, (text) => atob(text.replace(/\s/g, ''))],
    [
      hex,
      (text) =>
        text
          .split(' ')
          .map((n) => String.fromCharCode(parseInt(n, 16)))
          .join(''),
    ],
  ]
  const exposed: boolean[] = []
  try {
    for (const [message, restore] of cases) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ detail: { message } }, { status: 422 })),
      )
      const model = GEN_MODELS.find((m) => m.provider === 'elevenlabs')!
      const result = await generate(model, {}, key, new AbortController().signal)
      const detail = result.ok ? '' : JSON.stringify(result)
      try {
        exposed.push(detail !== '' && restore(detail).includes(key))
      } catch {
        // A safe replacement need not be valid in the original encoding.
        exposed.push(false)
      }
    }
  } finally {
    vi.unstubAllGlobals()
  }
  expect(exposed).toEqual([false, false, false])
})

it('keeps key material out of queue progress from submit and status responses', async () => {
  // SNDX-62: a numeric secret is valid for fal and representable without rounding.
  const secret = '1122334455667788'
  const key = '01020304-0506-4708-8900-112233445566:' + secret
  const queued = {
    // The UI displays ahead + 1.
    queue_position: Number(secret) - 1,
    status_url: 'https://queue.fal.run/review/status',
    response_url: 'https://queue.fal.run/review/result',
    cancel_url: 'https://queue.fal.run/review/cancel',
  }
  const exposed: boolean[] = []
  try {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
        Response.json(init?.method === 'POST' ? queued : { status: 'FAILED' }),
      ),
    )
    const model = GEN_MODELS.find((m) => m.provider === 'fal')!
    await generate(model, {}, key, new AbortController().signal, (status) => {
      if (status.phase === 'queue')
        exposed.push(String((status.position ?? -1) + 1).includes(secret))
    })
    const polled = falState({ status: 'IN_QUEUE', queue_position: Number(secret) - 1 })
    exposed.push(polled.phase === 'queue' && String((polled.position ?? -1) + 1).includes(secret))
  } finally {
    vi.unstubAllGlobals()
  }
  expect(exposed).toEqual([false, false])
})

it('keeps transformed credentials out of service errors at the display boundary', async () => {
  // SNDX-57: synthetic credentials, and every request is intercepted.
  const secret = 'aB12cD34eF56gH78iJ90kL12mN34oP56'
  const falKey = '01020304-0506-4708-8900-112233445566:' + secret
  const elevenKey = 'sk_0123456789abcdef0123456789abcdef'
  const spaced = falKey.match(/.{1,4}/g)!.join('\n')
  const encoded = [...elevenKey].map((c) => '%' + c.charCodeAt(0).toString(16)).join('')
  const queued = {
    status_url: 'https://queue.fal.run/review/status',
    response_url: 'https://queue.fal.run/review/result',
    cancel_url: 'https://queue.fal.run/review/cancel',
  }
  const cases = [
    { provider: 'fal', key: falKey, body: { status: 'COMPLETED', error: spaced }, secret },
    {
      provider: 'fal',
      key: falKey,
      body: { status: 'COMPLETED', error: 'Refused', error_type: secret.toLowerCase() },
      secret,
    },
    {
      provider: 'elevenlabs',
      key: elevenKey,
      body: { detail: { message: encoded } },
      secret: elevenKey,
    },
  ]
  const exposed: boolean[] = []
  try {
    for (const item of cases) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
          if (item.provider === 'elevenlabs') return Response.json(item.body, { status: 422 })
          return Response.json(
            init?.method === 'POST' ? queued : init?.method === 'PUT' ? {} : item.body,
          )
        }),
      )
      const model = GEN_MODELS.find((m) => m.provider === item.provider)!
      const result = await generate(model, {}, item.key, new AbortController().signal)
      const message = result.ok ? '' : JSON.stringify(result)
      const normalized = decodeURIComponent(message).replace(/\s+/g, '').toLowerCase()
      exposed.push(normalized.includes(item.secret.toLowerCase()))
    }
  } finally {
    vi.unstubAllGlobals()
  }
  // Assertions contain only exposure flags, never credentials.
  expect(exposed).toEqual([false, false, false])
})

it('lets no text or value from a response body reach the result or the progress line', async () => {
  // Every field a service could fill carries the marker; none of it may come out.
  const marker = 'MARKER7f3a'
  const noisy = {
    status: marker,
    error: marker,
    error_type: marker,
    detail: { message: marker, status: marker },
    message: marker,
    queue_position: marker,
  }
  const key = '01020304-0506-4708-8900-112233445566:' + 'c'.repeat(32)
  const seen: string[] = []
  const bodies: [number, object][] = [
    [422, noisy],
    [500, noisy],
    [200, { ...noisy, status: 'COMPLETED' }],
    [200, noisy],
  ]
  try {
    for (const provider of ['fal', 'elevenlabs'] as const) {
      for (const [code, body] of bodies) {
        vi.stubGlobal(
          'fetch',
          vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            if (provider === 'fal' && init?.method === 'POST') {
              return Response.json({
                ...noisy,
                status_url: 'https://queue.fal.run/r/status',
                response_url: 'https://queue.fal.run/r',
                cancel_url: 'https://queue.fal.run/r/cancel',
              })
            }
            if (init?.method === 'PUT') return Response.json({})
            return Response.json(body, { status: code })
          }),
        )
        const model = GEN_MODELS.find((m) => m.provider === provider)!
        const k = provider === 'fal' ? key : 'sk_' + 'c'.repeat(40)
        const result = await generate(model, {}, k, new AbortController().signal, (s) =>
          seen.push(JSON.stringify(s)),
        )
        seen.push(JSON.stringify(result))
      }
    }
  } finally {
    vi.unstubAllGlobals()
  }
  expect(seen.some((text) => text.includes(marker))).toBe(false)
})
