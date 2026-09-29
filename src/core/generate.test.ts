import { describe, expect, it } from 'vitest'
import {
  apiError,
  audioUrlOf,
  defaultModel,
  falState,
  GEN_MODELS,
  generatedName,
  inputFor,
  isKeyOf,
  keyFor,
  keyService,
  promptFor,
  resultType,
  runLimited,
} from './generate'

const [direct, eleven, stable] = GEN_MODELS

describe('sound generation', () => {
  it('builds each model input with length and prompt influence kept in range', () => {
    expect(inputFor(eleven, ' Click ', 0.2)).toEqual({
      text: 'Click',
      duration_seconds: 0.5,
      prompt_influence: 0.3,
      output_format: 'mp3_44100_128',
    })
    expect(inputFor(stable, 'Coin', 9, 0.9)).toEqual({
      prompt: 'Coin',
      duration: 5,
      output_format: 'ogg',
    })
    expect(inputFor(direct, 'Hit', 1.23, 1.7)).toEqual({
      text: 'Hit',
      duration_seconds: 1.2,
      prompt_influence: 1,
      model_id: 'eleven_text_to_sound_v2',
    })
  })

  it('starts the prompt from the event name and up to three search words', () => {
    expect(promptFor({ name: 'Coin', file: 'coin', words: ['coin', 'chips', 'jingle', 'x'] })).toBe(
      'Short game interface sound: Coin (coin, chips, jingle). Clean, no music, no voices.',
    )
    expect(promptFor({ name: ' ', file: 'hit', words: [] })).toBe(
      'Short game interface sound: hit. Clean, no music, no voices.',
    )
  })

  it('picks the first model of a service whose key is at hand', () => {
    expect(defaultModel(() => false)).toBe(direct)
    expect(defaultModel((p) => p === 'fal')).toBe(eleven)
    expect(defaultModel(() => true)).toBe(direct)
  })

  it('sends a key only to its own service, whatever was copied along with it', () => {
    const eleven = `sk_${'a1'.repeat(24)}`
    const fal = `1b2c3d4e-5f60-4a1b-9c2d-3e4f5a6b7c8d:${'0f'.repeat(16)}`
    const wrappers = [
      (k: string) => `"${k}"`,
      (k: string) => `'${k}'`,
      (k: string) => `API_KEY=${k}`,
    ]
    for (const wrap of wrappers) {
      expect(keyFor(wrap(eleven), 'elevenlabs')).toEqual({ ok: true, key: eleven })
      expect(keyFor(wrap(eleven), 'fal')).toEqual({
        ok: false,
        reason: 'other',
        owner: 'elevenlabs',
      })
      expect(keyFor(wrap(fal), 'fal')).toEqual({ ok: true, key: fal })
      expect(keyFor(wrap(fal), 'elevenlabs')).toEqual({ ok: false, reason: 'other', owner: 'fal' })
    }
    // What else people copy: export, a JSON line, line breaks.
    expect(keyFor(`export FAL_KEY="${fal}"`, 'fal')).toEqual({ ok: true, key: fal })
    expect(keyFor(`  "ELEVENLABS_API_KEY": "${eleven}",\n`, 'elevenlabs')).toEqual({
      ok: true,
      key: eleven,
    })
    // Older ElevenLabs keys (32 hex) and a region suffix are ElevenLabs too.
    expect(keyService('0123456789abcdef0123456789abcdef')).toBe('elevenlabs')
    expect(keyService(`${eleven}_residency_eu`)).toBe('elevenlabs')
    // Anything else goes nowhere.
    expect(keyFor('my-secret-token', 'fal')).toEqual({ ok: false, reason: 'unknown' })
    expect(keyFor('  ', 'elevenlabs')).toEqual({ ok: false, reason: 'empty' })
  })

  it('never sends another service secret hidden in front of a key', () => {
    const eleven = `sk_${'a1'.repeat(24)}`
    const fal = `1b2c3d4e-5f60-4a1b-9c2d-3e4f5a6b7c8d:${'0f'.repeat(16)}`
    for (const raw of [`API_KEY=${eleven}=${fal}`, `\`${eleven}=${fal}\``]) {
      const check = keyFor(raw, 'fal')
      expect(!check.ok || check.key === fal).toBe(true)
    }
    // The value that goes out is checked as a whole, right before sending.
    expect(isKeyOf(fal, 'fal')).toBe(true)
    expect(isKeyOf(`${eleven}=${fal}`, 'fal')).toBe(false)
  })

  it('finds the audio file in the output', () => {
    expect(audioUrlOf({ audio: { url: 'https://v3.fal.media/files/a.mp3' } })).toBe(
      'https://v3.fal.media/files/a.mp3',
    )
    expect(audioUrlOf({ audio: {} })).toBeNull()
    expect(audioUrlOf(null)).toBeNull()
  })

  it('names generated files after the event', () => {
    expect(generatedName('click', [], 'audio/mpeg', 'https://x/y.bin')).toBe('click-ai.mp3')
    expect(generatedName('click', ['click-ai.mp3'], 'audio/mpeg', 'https://x/y')).toBe(
      'click-ai-2.mp3',
    )
    expect(generatedName('click', [], '', 'https://x/z.ogg?download=1')).toBe('click-ai.ogg')
    expect(generatedName('click', [], 'application/octet-stream', 'https://x/z')).toBe(
      'click-ai.mp3',
    )
    // A WAV served as octet-stream keeps its extension from the URL, and so does its type.
    const wav = ['application/octet-stream', 'https://v3.fal.media/files/a.wav'] as const
    expect(generatedName('click', [], ...wav)).toBe('click-ai.wav')
    expect(resultType(...wav)).toBe('audio/wav')
  })

  it('tells why fal or ElevenLabs refused, by category only', () => {
    expect(apiError(401, null)).toBe('key')
    expect(apiError(403, { detail: 'User is locked. Reason: Exhausted balance.' })).toBe('balance')
    expect(apiError(402, null)).toBe('balance')
    expect(apiError(422, { detail: [{ msg: 'text is required' }] })).toBe('input')
    expect(apiError(429, null)).toBe('busy')
    expect(apiError(500, 'oops')).toBe('network')
    // ElevenLabs puts an object into "detail".
    expect(
      apiError(401, {
        detail: { status: 'quota_exceeded', message: 'This request exceeds your quota.' },
      }),
    ).toBe('balance')
  })

  it('reads where a request is in the fal queue, keeping no value that is not a small number', () => {
    expect(falState({ status: 'IN_QUEUE', queue_position: 2 })).toEqual({
      phase: 'queue',
      position: 2,
    })
    // Only a whole number up to 999 is a position; anything else is just "in queue".
    for (const odd of [undefined, -1, 1.5, 1000, 1122334455667787, '3'])
      expect(falState({ status: 'IN_QUEUE', queue_position: odd })).toEqual({
        phase: 'queue',
        position: null,
      })
    expect(falState({ status: 'IN_PROGRESS', logs: [] })).toEqual({ phase: 'running' })
    expect(falState({ status: 'COMPLETED', metrics: {} })).toEqual({ phase: 'done', failed: false })
    // A failure is COMPLETED with an error, not a status of its own.
    expect(falState({ status: 'COMPLETED', error: 'Prompt is empty' })).toEqual({
      phase: 'done',
      failed: true,
    })
    expect(falState({ status: 'PAUSED' })).toEqual({ phase: 'unknown' })
    expect(falState(null)).toEqual({ phase: 'unknown' })
  })

  it('runs at most a few tasks at once, in order, and stops starting new ones on abort', async () => {
    let running = 0
    let peak = 0
    const task = (n: number) => async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 5))
      running--
      return n
    }
    expect(await runLimited([1, 2, 3, 4, 5, 6, 7].map(task), 3)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(peak).toBe(3)

    const controller = new AbortController()
    const started: number[] = []
    const stopper = (n: number) => async () => {
      started.push(n)
      if (n === 2) controller.abort()
      return n
    }
    await runLimited([1, 2, 3, 4].map(stopper), 1, controller.signal)
    expect(started).toEqual([1, 2])
  })
})
