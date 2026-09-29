# Soundix Generate (fal.ai) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this project run it inline: Scott forbids subagents.

**Goal:** Generate a sound for the current event on fal.ai with the person's own key and keep it in My sounds.

**Architecture:** Pure logic (models, prompt, inputs, file names, errors) lives in `src/core/generate.ts` with tests. A fetch-based adapter talks to the fal queue from the browser; the key is stored only on request. Generated sounds are own sounds with a `generated` note that travels in the sound reference into `soundix.json` and `CREDITS.txt`.

**Tech Stack:** Vite, React 19, TypeScript, Vitest, idb-keyval, plain `fetch` (no fal client).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-28-soundix-generate-design.md`.
- Soundix stays a static site: no server, no new runtime dependency.
- The key goes only to `https://queue.fal.run`; never into the set, history, links, `soundix.json`, ZIP, console or error texts.
- Remembered key: `localStorage` key `soundix:fal-key`, only with "Remember in this browser" (off by default).
- Models: `fal-ai/elevenlabs/sound-effects/v2` (default) and `fal-ai/stable-audio-3/small/sfx/text-to-audio`. Length 0.5–5 s, default 1 s.
- UI text English. Code, comments and commits in English; Prettier: no semicolons, single quotes, width 100.
- Tests only in `src/core`; one full `npm test` per stage.
- Publishing: squash into the single root commit (author `flux <105543365+scottlaren@users.noreply.github.com>`, no Claude trailer), force-push `main`, watch the Pages run.

---

### Task 1: Core generation logic

**Files:**
- Create: `src/core/generate.ts`
- Test: `src/core/generate.test.ts`

**Interfaces:**
- Consumes: `extOf(path)` from `src/core/entries.ts`, `SoundEvent` from `src/core/types.ts`.
- Produces:
  - `interface GenModel { id: string; label: string; url: string; input: (prompt: string, seconds: number) => Record<string, unknown> }`
  - `GEN_MODELS: GenModel[]`, `modelById(id: string): GenModel | undefined`
  - `MIN_SECONDS = 0.5`, `MAX_SECONDS = 5`, `DEFAULT_SECONDS = 1`
  - `promptFor(event: Pick<SoundEvent, 'name' | 'file' | 'words'>): string`
  - `inputFor(model: GenModel, prompt: string, seconds: number): Record<string, unknown>`
  - `audioUrlOf(output: unknown): string | null`
  - `generatedName(eventFile: string, taken: string[], contentType: string, url: string): string`
  - `type GenError = 'key' | 'balance' | 'input' | 'busy' | 'network' | 'timeout' | 'bad-audio'`
  - `falError(status: number, body: unknown): { error: GenError; detail?: string }`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  audioUrlOf,
  falError,
  GEN_MODELS,
  generatedName,
  inputFor,
  promptFor,
} from './generate'

const [eleven, stable] = GEN_MODELS

describe('sound generation', () => {
  it('builds each model input with the length kept in range', () => {
    expect(inputFor(eleven, ' Click ', 0.2)).toEqual({
      text: 'Click',
      duration_seconds: 0.5,
      output_format: 'mp3_44100_128',
    })
    expect(inputFor(stable, 'Coin', 9)).toEqual({ prompt: 'Coin', duration: 5, output_format: 'ogg' })
  })

  it('starts the prompt from the event name and up to three search words', () => {
    expect(promptFor({ name: 'Coin', file: 'coin', words: ['coin', 'chips', 'jingle', 'x'] })).toBe(
      'Coin: a short sound effect for a game UI, like coin, chips, jingle',
    )
    expect(promptFor({ name: ' ', file: 'hit', words: [] })).toBe(
      'hit: a short sound effect for a game UI',
    )
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
  })

  it('tells why fal refused', () => {
    expect(falError(401, null)).toEqual({ error: 'key' })
    expect(falError(403, { detail: 'User is locked. Reason: Exhausted balance.' })).toEqual({
      error: 'balance',
    })
    expect(falError(402, null)).toEqual({ error: 'balance' })
    expect(falError(422, { detail: [{ msg: 'text is\nrequired' }, { msg: 'too long' }] })).toEqual({
      error: 'input',
      detail: 'text is required; too long',
    })
    expect(falError(429, null)).toEqual({ error: 'busy' })
    expect(falError(500, 'oops')).toEqual({ error: 'network' })
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/core/generate.test.ts`
Expected: FAIL, `Failed to resolve import "./generate"`.

- [ ] **Step 3: Implement `src/core/generate.ts`**

```ts
// Sound generation on fal.ai with the person's own key: models, inputs, file names and errors.
import { extOf } from './entries'
import type { SoundEvent } from './types'

export interface GenModel {
  /** fal endpoint id */
  id: string
  label: string
  /** Page with the price and the terms */
  url: string
  input: (prompt: string, seconds: number) => Record<string, unknown>
}

export const GEN_MODELS: GenModel[] = [
  {
    id: 'fal-ai/elevenlabs/sound-effects/v2',
    label: 'ElevenLabs Sound Effects V2',
    url: 'https://fal.ai/models/fal-ai/elevenlabs/sound-effects/v2',
    input: (prompt, seconds) => ({
      text: prompt,
      duration_seconds: seconds,
      output_format: 'mp3_44100_128',
    }),
  },
  {
    id: 'fal-ai/stable-audio-3/small/sfx/text-to-audio',
    label: 'Stable Audio 3 SFX',
    url: 'https://fal.ai/models/fal-ai/stable-audio-3/small/sfx/text-to-audio',
    input: (prompt, seconds) => ({ prompt, duration: seconds, output_format: 'ogg' }),
  },
]

export const MIN_SECONDS = 0.5
export const MAX_SECONDS = 5
export const DEFAULT_SECONDS = 1

export const modelById = (id: string) => GEN_MODELS.find((m) => m.id === id)

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** A starting prompt: the event name and up to three of its search words. */
export function promptFor(event: Pick<SoundEvent, 'name' | 'file' | 'words'>): string {
  const name = event.name.trim() || event.file
  const like = event.words.slice(0, 3)
  const tail = like.length ? `, like ${like.join(', ')}` : ''
  return `${name}: a short sound effect for a game UI${tail}`
}

/** The model input; the length is kept in range and rounded to 0.1 s. */
export function inputFor(model: GenModel, prompt: string, seconds: number) {
  const s = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, seconds))
  return model.input(prompt.trim(), Math.round(s * 10) / 10)
}

/** Both models answer { audio: { url } }. */
export function audioUrlOf(output: unknown): string | null {
  const audio = isObj(output) ? output.audio : null
  return isObj(audio) && typeof audio.url === 'string' ? audio.url : null
}

const EXTS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/opus': 'opus',
}

/** <event>-ai.<ext>, then -ai-2, -ai-3… among the names My sounds already has. */
export function generatedName(
  eventFile: string,
  taken: string[],
  contentType: string,
  url: string,
): string {
  const ext = EXTS[contentType.split(';')[0].trim()] || extOf(url.split('?')[0]) || 'mp3'
  const used = new Set(taken)
  for (let n = 1; ; n++) {
    const name = `${eventFile}-ai${n > 1 ? `-${n}` : ''}.${ext}`
    if (!used.has(name)) return name
  }
}

export type GenError = 'key' | 'balance' | 'input' | 'busy' | 'network' | 'timeout' | 'bad-audio'

/** fal puts the reason in "detail": a string or a list of { msg }. */
function detailOf(body: unknown): string {
  const detail = isObj(body) ? body.detail : body
  const text =
    typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail
            .map((d) => (isObj(d) && typeof d.msg === 'string' ? d.msg : ''))
            .filter(Boolean)
            .join('; ')
        : ''
  return text.replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** Why fal refused a request, from the HTTP status and its body. */
export function falError(status: number, body: unknown): { error: GenError; detail?: string } {
  const detail = detailOf(body)
  if (status === 402 || /balance|credit|billing/i.test(detail)) return { error: 'balance' }
  if (status === 401 || status === 403) return { error: 'key' }
  if (status === 422) return detail ? { error: 'input', detail } : { error: 'input' }
  if (status === 429) return { error: 'busy' }
  return { error: 'network' }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/core/generate.test.ts`
Expected: PASS, 5 tests.

---

### Task 2: The generated note travels with the sound

**Files:**
- Modify: `src/core/types.ts` (`Generated`, `SoundRef`, `ListSound`, `OwnSound`)
- Modify: `src/core/soundix-json.ts` (`SoundixSource.generated`)
- Modify: `src/core/entries.ts` (own source)
- Modify: `src/core/export.ts` (`buildCredits`)
- Modify: `src/ui/state.ts` (`restoreRef`)
- Modify: `src/ui/sounds.ts` (`ownToList`, `refFor`)
- Test: `src/core/export.test.ts`

**Interfaces:**
- Consumes: `modelById` from Task 1.
- Produces: `interface Generated { model: string; prompt: string }` in `src/core/types.ts`; `SoundRef` own variant `{ kind: 'own'; id: string; name: string; generated?: Generated }`; `ListSound.generated?`; `OwnSound.generated?`; `SoundixSource.generated?`.

- [ ] **Step 1: Write the failing test** (append to `describe('planExport')` in `src/core/export.test.ts`)

```ts
  it('credits generated sounds with their model and prompt', () => {
    const generated = { model: GEN_MODELS[0].id, prompt: 'Click:\na short UI click' }
    const click = event({
      file: 'click',
      sound: { kind: 'own', id: 'own:1', name: 'click-ai.mp3', generated },
    })
    const { files } = planExport([click], [], library, 'original')
    const credits = text(files, 'CREDITS.txt')
    expect(credits).toContain('Generated with AI')
    expect(credits).toContain('sounds/click.mp3 — ElevenLabs Sound Effects V2')
    expect(credits).toContain('Prompt: Click: a short UI click')
    expect(JSON.parse(text(files, 'soundix.json')).events[0].source).toEqual({
      own: true,
      original: 'click-ai.mp3',
      generated,
    })
  })
```

Imports to add at the top: `import { GEN_MODELS } from './generate'` and `event` from `./test-fixtures`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/core/export.test.ts`
Expected: FAIL: TypeScript rejects `generated` on the own ref, or `credits` lacks "Generated with AI".

- [ ] **Step 3: Types** — in `src/core/types.ts` add before `SoundRef`:

```ts
/** How a sound was generated on fal.ai */
export interface Generated {
  /** fal endpoint id */
  model: string
  prompt: string
}
```

and change the own variant and the two interfaces:

```ts
  | { kind: 'own'; id: string; name: string; generated?: Generated }
```

```ts
export interface ListSound {
  id: string
  pack: string
  name: string
  tags: string[]
  duration: number
  generated?: Generated
}
```

```ts
export interface OwnSound {
  id: string
  name: string
  type: string
  duration: number
  generated?: Generated
}
```

- [ ] **Step 4: Source** — `src/core/soundix-json.ts`, in `SoundixSource` add `generated?: Generated` (import `Generated` from `./types`). In `src/core/entries.ts` replace the own source:

```ts
        source: {
          own: true,
          original: ref.name,
          ...(ref.generated && { generated: ref.generated }),
        },
```

- [ ] **Step 5: Credits** — in `src/core/export.ts` import `modelById` from `./generate` and replace `buildCredits`:

```ts
/** Packs whose sounds are in the archive, in library order, then generated sounds. */
export function buildCredits(entries: ExportEntry[], library: Library): string {
  const used = new Set(entries.map((e) => e.pack?.id))
  const blocks = library.packs
    .filter((p) => used.has(p.id))
    .map((p) => `${p.name} — ${p.author}\n${p.url}\nLicense: ${p.license}`)
  const body = blocks.length ? blocks.join('\n\n') : 'No library sounds in this archive.'
  return `Sound credits\n=============\n\n${body}\n\n${generatedCredits(entries)}${MADE_WITH}\n`
}

/** Generated sounds are not CC0: the model's terms apply. */
function generatedCredits(entries: ExportEntry[]): string {
  const blocks = entries.flatMap(({ path, source }) => {
    if (!source.generated) return []
    const model = modelById(source.generated.model)
    const prompt = source.generated.prompt.replace(/\s+/g, ' ').trim()
    return [
      `${path} — ${model?.label ?? source.generated.model}\nPrompt: ${prompt}\nTerms: ${model?.url ?? 'https://fal.ai'}`,
    ]
  })
  if (!blocks.length) return ''
  const note = 'These sounds are not CC0: the terms of the model and fal.ai apply.'
  return `Generated with AI\n-----------------\n\n${blocks.join('\n\n')}\n\n${note}\n\n`
}
```

- [ ] **Step 6: Keep the note in the app** — `src/ui/state.ts` `restoreRef`, own branch:

```ts
  if (raw.kind === 'own' && typeof raw.id === 'string' && typeof raw.name === 'string') {
    const g = raw.generated
    const generated =
      isObj(g) && typeof g.model === 'string' && typeof g.prompt === 'string'
        ? { model: g.model, prompt: g.prompt }
        : undefined
    return { kind: 'own', id: raw.id, name: raw.name, ...(generated && { generated }) }
  }
```

`src/ui/sounds.ts`:

```ts
export const ownToList = (s: StoredOwnSound): ListSound => ({
  id: s.id,
  pack: OWN_PACK,
  name: s.name,
  tags: [],
  duration: s.duration,
  ...(s.generated && { generated: s.generated }),
})
```

```ts
export const refFor = (sound: ListSound): SoundRef =>
  sound.pack === OWN_PACK
    ? { kind: 'own', id: sound.id, name: sound.name, ...(sound.generated && { generated: sound.generated }) }
    : { kind: 'library', id: sound.id }
```

- [ ] **Step 7: Run core tests and types**

Run: `npx vitest run src/core && npx tsc --noEmit -p .`
Expected: all pass, no type errors.

---

### Task 3: fal adapter, key storage, adding a generated sound

**Files:**
- Create: `src/adapters/fal.ts`
- Create: `src/storage/fal-key.ts`
- Modify: `src/ui/hooks.ts` (`OwnSounds.addGenerated`)

**Interfaces:**
- Consumes: `audioUrlOf`, `falError`, `GenError` (Task 1); `Generated` (Task 2).
- Produces:
  - `type GenResult = { ok: true; blob: Blob; contentType: string; url: string } | { ok: false; error: GenError | 'cancelled'; detail?: string }`
  - `generateSound(modelId: string, input: object, key: string, signal: AbortSignal): Promise<GenResult>`
  - `loadFalKey(): string`, `saveFalKey(key: string): void`, `forgetFalKey(): void`
  - `OwnSounds.addGenerated(blob: Blob, name: string, generated: Generated): Promise<StoredOwnSound | null>`

- [ ] **Step 1: `src/storage/fal-key.ts`**

```ts
// The fal.ai key, stored only when the person asks. Every page on smaltra.github.io shares this
// localStorage, so by default the key lives in memory only.
const KEY = 'soundix:fal-key'

export function loadFalKey(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveFalKey(key: string) {
  try {
    localStorage.setItem(KEY, key)
  } catch {
    // Not remembered; it still works for this tab.
  }
}

export function forgetFalKey() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing stored.
  }
}
```

- [ ] **Step 2: `src/adapters/fal.ts`**

```ts
// The fal.ai queue from the browser with the person's key: submit, wait, fetch the file.
import { audioUrlOf, falError, type GenError } from '../core/generate'

const QUEUE = 'https://queue.fal.run'
const POLL_MS = 1000
const TIMEOUT_MS = 120_000

export type GenResult =
  | { ok: true; blob: Blob; contentType: string; url: string }
  | { ok: false; error: GenError | 'cancelled'; detail?: string }

interface Queued {
  status_url: string
  response_url: string
  cancel_url: string
}

type Refusal = ReturnType<typeof falError>
const isRefusal = (e: unknown): e is Refusal =>
  !!e && typeof e === 'object' && typeof (e as Refusal).error === 'string'

// The key is only ever sent to the queue host, whatever URLs a response names.
const onQueue = (url: string) => {
  try {
    return new URL(url).origin === QUEUE
  } catch {
    return false
  }
}

async function call(url: string, key: string, signal: AbortSignal, init: RequestInit = {}) {
  if (!onQueue(url)) throw { error: 'network' } satisfies Refusal
  const response = await fetch(url, {
    ...init,
    signal,
    headers: { ...init.headers, Authorization: `Key ${key}` },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw falError(response.status, body)
  return body
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })

function cancel(queued: Queued, key: string) {
  if (!onQueue(queued.cancel_url)) return
  fetch(queued.cancel_url, { method: 'PUT', headers: { Authorization: `Key ${key}` } }).catch(
    () => undefined,
  )
}

/** Generates one sound. Aborting the signal cancels the request on fal too. */
export async function generateSound(
  modelId: string,
  input: object,
  key: string,
  signal: AbortSignal,
): Promise<GenResult> {
  const started = Date.now()
  let queued: Queued | null = null
  try {
    queued = (await call(`${QUEUE}/${modelId}`, key, signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })) as Queued
    for (;;) {
      const { status } = await call(queued.status_url, key, signal)
      if (status === 'COMPLETED') break
      if (Date.now() - started > TIMEOUT_MS) {
        cancel(queued, key)
        return { ok: false, error: 'timeout' }
      }
      await wait(POLL_MS, signal)
    }
    const url = audioUrlOf(await call(queued.response_url, key, signal))
    if (!url) return { ok: false, error: 'bad-audio' }
    const file = await fetch(url, { signal }) // a public file: no key
    if (!file.ok) return { ok: false, error: 'network' }
    const blob = await file.blob()
    return { ok: true, blob, contentType: file.headers.get('content-type') ?? blob.type, url }
  } catch (e) {
    if (signal.aborted) {
      if (queued) cancel(queued, key)
      return { ok: false, error: 'cancelled' }
    }
    return isRefusal(e) ? { ok: false, ...e } : { ok: false, error: 'network' }
  }
}
```

- [ ] **Step 3: `src/ui/hooks.ts`** — add to `OwnSounds`:

```ts
  /** Adds a generated sound to My sounds; null when this browser cannot play it. */
  addGenerated: (blob: Blob, name: string, generated: Generated) => Promise<StoredOwnSound | null>
```

and in `useOwnSoundsData` before `return`:

```ts
  const addGenerated = useCallback(async (blob: Blob, name: string, generated: Generated) => {
    const sound = await readOwnSound(new File([blob], name, { type: blob.type }))
    if (!sound) return null
    const stored = { ...sound, generated }
    await putOwnSound(stored)
    setList((prev) => [...prev, stored])
    return stored
  }, [])

  return { ready, list, add, addGenerated, remove }
```

(import `type Generated` from `../core/types`).

- [ ] **Step 4: Types**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

---

### Task 4: Generate dialog, library button, AI tag

**Files:**
- Create: `src/ui/GenerateDialog.tsx`
- Modify: `src/ui/LibraryPanel.tsx` (button, dialog)
- Modify: `src/ui/SoundRow.tsx` (AI tag)
- Modify: `src/ui/icons.tsx` (`sparkle`)
- Modify: `src/i18n/en.ts`, `src/ui/styles.css`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `GenerateDialog({ event, onClose }: { event: SoundEvent; onClose: () => void })`.

- [ ] **Step 1: Texts** — `src/i18n/en.ts`, after `addOwn`:

```ts
  generate: 'Generate',
  generateTitle: 'Generate a sound',
  genNoEvent: 'Pick an event to generate a sound for it',
  genPrompt: 'Prompt',
  genModel: 'Model',
  genTerms: 'Price and terms',
  genLength: (s: number) => `Length ${s.toFixed(1)} s`,
  genKey: 'fal key',
  genGetKey: 'Get a key',
  genRemember: 'Remember in this browser',
  genRememberNote:
    'Any page on smaltra.github.io can read a remembered key. A separate fal key with a spending limit is safer.',
  genKeySaved: (tail: string) => `Key ····${tail}`,
  genChange: 'Change',
  genForget: 'Forget',
  genRun: 'Generate',
  genRunning: 'Generating…',
  genCancel: 'Cancel',
  genUse: (event: string) => `Use for ${event}`,
  genNote:
    'Your key and prompt go straight to fal.ai; Soundix has no server. Generations are paid from your fal balance.',
  genErrors: {
    key: 'The key was not accepted. Check it on fal.ai.',
    balance: 'Your fal balance is empty.',
    input: 'fal did not accept the request:',
    busy: 'fal is busy. Try again in a moment.',
    network: 'fal could not be reached.',
    timeout: 'fal took too long. Try again.',
    'bad-audio': 'The sound came back in a format this browser cannot play.',
  },
  aiTag: 'AI',
```

- [ ] **Step 2: Icon** — `src/ui/icons.tsx`, add to `LINE`:

```tsx
  sparkle: <path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8-1.8 5.2-1.8-5.2-5.2-1.8 5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />,
```

- [ ] **Step 3: `src/ui/GenerateDialog.tsx`**

```tsx
import { useRef, useState } from 'react'
import { generateSound } from '../adapters/fal'
import { loadBuffer, playBuffer } from '../audio/player'
import {
  DEFAULT_SECONDS,
  GEN_MODELS,
  generatedName,
  inputFor,
  MAX_SECONDS,
  MIN_SECONDS,
  modelById,
  promptFor,
  type GenError,
} from '../core/generate'
import type { SoundEvent } from '../core/types'
import { forgetFalKey, loadFalKey, saveFalKey } from '../storage/fal-key'
import type { StoredOwnSound } from '../storage/own-sounds'
import { Dialog } from './Dialog'
import { Icon } from './icons'
import { formatDuration, ownToList, refFor } from './sounds'
import { useApp, useServices } from './store'

// The key of this tab survives closing the dialog; a reload forgets it unless it is remembered.
let tabKey = ''

export function GenerateDialog({ event, onClose }: { event: SoundEvent; onClose: () => void }) {
  const { state, dispatch, t } = useApp()
  const { own } = useServices()
  const [prompt, setPrompt] = useState(() => promptFor(event))
  const [modelId, setModelId] = useState(GEN_MODELS[0].id)
  const [seconds, setSeconds] = useState(DEFAULT_SECONDS)
  const [key, setKey] = useState(() => tabKey || loadFalKey())
  const [remember, setRemember] = useState(() => loadFalKey() !== '')
  const [editingKey, setEditingKey] = useState(() => !(tabKey || loadFalKey()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<StoredOwnSound[]>([])
  const running = useRef<AbortController | null>(null)
  const model = modelById(modelId) ?? GEN_MODELS[0]

  const errorText = (code: GenError, detail?: string) =>
    code === 'input' && detail ? `${t.genErrors.input} ${detail}` : t.genErrors[code]

  const play = (sound: StoredOwnSound) =>
    loadBuffer(sound.id, () => sound.blob.arrayBuffer())
      .then((buffer) => playBuffer(buffer, event.volume * state.listenVolume, 0))
      .catch(() => undefined)

  const toggleRemember = (on: boolean) => {
    setRemember(on)
    if (on && key.trim()) saveFalKey(key.trim())
    if (!on) forgetFalKey()
  }

  const forget = () => {
    tabKey = ''
    forgetFalKey()
    setKey('')
    setRemember(false)
    setEditingKey(true)
  }

  const run = async () => {
    const k = key.trim()
    if (!k || !prompt.trim() || busy) return
    tabKey = k
    if (remember) saveFalKey(k)
    setEditingKey(false)
    setBusy(true)
    setError('')
    const controller = new AbortController()
    running.current = controller
    const result = await generateSound(
      model.id,
      inputFor(model, prompt, seconds),
      k,
      controller.signal,
    )
    running.current = null
    setBusy(false)
    if (!result.ok) {
      if (result.error !== 'cancelled') setError(errorText(result.error, result.detail))
      return
    }
    const taken = own.list.map((s) => s.name)
    const name = generatedName(event.file, taken, result.contentType, result.url)
    const sound = await own.addGenerated(result.blob, name, {
      model: model.id,
      prompt: prompt.trim(),
    })
    if (!sound) return setError(t.genErrors['bad-audio'])
    setResults((list) => [sound, ...list])
    void play(sound)
  }

  const use = (sound: StoredOwnSound) => {
    dispatch({ type: 'assign', key: event.key, sound: refFor(ownToList(sound)) })
    close()
  }

  const close = () => {
    running.current?.abort()
    onClose()
  }

  return (
    <Dialog open title={t.generateTitle} onClose={close}>
      <div className="gen">
        <label className="field">
          <span>{t.genPrompt}</span>
          <textarea
            rows={3}
            maxLength={500}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        <div className="field-row">
          <label className="field grow">
            <span>{t.genModel}</span>
            <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
              {GEN_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <small>
              <a href={model.url} target="_blank" rel="noreferrer">
                {t.genTerms}
              </a>
            </small>
          </label>
          <label className="field gen-length">
            <span>{t.genLength(seconds)}</span>
            <input
              type="range"
              min={MIN_SECONDS}
              max={MAX_SECONDS}
              step={0.1}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
            />
          </label>
        </div>
        {editingKey ? (
          <div className="field">
            <label className="field">
              <span>{t.genKey}</span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <small>
              <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer">
                {t.genGetKey}
              </a>
            </small>
            <label className="gen-check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => toggleRemember(e.target.checked)}
              />
              {t.genRemember}
            </label>
            {remember && <small>{t.genRememberNote}</small>}
          </div>
        ) : (
          <p className="gen-key">
            {t.genKeySaved(key.trim().slice(-4))} ·{' '}
            <button className="link" onClick={() => setEditingKey(true)}>
              {t.genChange}
            </button>{' '}
            ·{' '}
            <button className="link" onClick={forget}>
              {t.genForget}
            </button>
          </p>
        )}
        {error && (
          <p className="gen-error" role="alert">
            {error}
          </p>
        )}
        {results.length > 0 && (
          <ul className="gen-results">
            {results.map((s) => (
              <li key={s.id}>
                <button className="play" aria-label={`${t.play} ${s.name}`} onClick={() => play(s)}>
                  <Icon name="play" size={11} />
                </button>
                <span className="row-name">{s.name}</span>
                <span className="row-dur">{formatDuration(s.duration)}</span>
                <button className="btn small" onClick={() => use(s)}>
                  {t.genUse(event.name || event.file)}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <small className="muted">{t.genNote}</small>
          {busy && (
            <button className="btn" onClick={() => running.current?.abort()}>
              {t.genCancel}
            </button>
          )}
          <button
            className="btn primary"
            disabled={busy || !key.trim() || !prompt.trim()}
            onClick={run}
          >
            {busy ? t.genRunning : t.genRun}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 4: Library button** — `src/ui/LibraryPanel.tsx`: `import { GenerateDialog } from './GenerateDialog'`, add `const [generating, setGenerating] = useState(false)`, and after the "Add your sounds" button:

```tsx
          <button
            className="btn small"
            disabled={!current}
            title={current ? undefined : t.genNoEvent}
            onClick={() => setGenerating(true)}
          >
            <Icon name="sparkle" size={14} />
            {t.generate}
          </button>
```

At the end of the returned `<section>`:

```tsx
      {generating && current && (
        <GenerateDialog key={current.key} event={current} onClose={() => setGenerating(false)} />
      )}
```

- [ ] **Step 5: AI tag** — `src/ui/SoundRow.tsx` (`import { modelById } from '../core/generate'`), after the name span:

```tsx
      {sound.generated && (
        <span
          className="ai-tag"
          title={`${modelById(sound.generated.model)?.label ?? sound.generated.model}: ${sound.generated.prompt}`}
        >
          {t.aiTag}
        </span>
      )}
```

- [ ] **Step 6: Styles** — append to `src/ui/styles.css`:

```css
/* generate dialog */
.gen {
  display: grid;
  gap: 12px;
}

.gen textarea,
.gen input[type='password'] {
  background: var(--panel);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  padding: 6px 9px;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  resize: vertical;
}

.gen-length {
  min-width: 160px;
}

.gen-check {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}

.gen-key {
  font-size: 13px;
}

button.link {
  background: none;
  border: 0;
  padding: 0;
  color: var(--led);
  text-decoration: underline;
}

.gen-error {
  color: #ff8a80;
  font-size: 13px;
}

.gen-results {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.gen-results li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gen-results .row-name {
  flex: 1;
}

.ai-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--line-2);
  color: var(--text);
}
```

- [ ] **Step 7: Types and build**

Run: `npx prettier --write src && npx tsc --noEmit -p . && npm run build`
Expected: no errors, build succeeds.

---

### Task 5: Docs, browser check, publish

**Files:**
- Modify: `public/llms.txt`, `README.md`

- [ ] **Step 1: Docs** — `README.md`, after the line about own sounds in the feature list:

```md
- Nothing fits? Generate a sound on fal.ai with your own key (Library → Generate); it lands in My sounds.
```

`public/llms.txt`, under "The ZIP from Export", after the `soundix.json` example:

```md
Own sounds generated in Soundix on fal.ai carry `"source": { "own": true, "original": "<file>", "generated": { "model": "<fal endpoint>", "prompt": "<prompt>" } }`; CREDITS.txt lists them under "Generated with AI". They are not CC0.
```

- [ ] **Step 2: Full checks**

Run: `npx prettier --write src && npx tsc --noEmit -p . && npm test && npm run build`
Expected: all tests pass (32 + 6 new), build succeeds.

- [ ] **Step 3: Browser check with a faked fal** — serve `dist` (`npx vite preview --port 4173`) and in Playwright route `https://queue.fal.run/**` and `https://v3.fal.media/**`:
  - `POST` model → `{ request_id, status_url: 'https://queue.fal.run/fal-ai/elevenlabs/requests/r1/status', response_url: '…/requests/r1', cancel_url: '…/requests/r1/cancel' }`; status → `IN_PROGRESS` once, then `COMPLETED`; response → `{ audio: { url: 'https://v3.fal.media/files/r1.mp3', content_type: 'audio/mpeg' } }`; the file → a real MP3 from the library (`/soundix/library/…`) with `content-type: audio/mpeg`.
  - Check: Generate opens with the prompt from the current event; without a key the button is disabled; with a test key a result appears, plays, carries the AI tag in My sounds; "Use for" assigns it; Export → `CREDITS.txt` has "Generated with AI"; `localStorage` has no `soundix:fal-key` unless Remember was ticked, and the ZIP and `soundix:v3` do not contain the key; Forget removes it.
  - Errors: status 401 → key text; POST 403 with balance detail → balance text; Cancel during `IN_PROGRESS` → no result and a `PUT` to the cancel URL.
  - Console: no errors.

- [ ] **Step 4: Publish** — squash into the single root commit with the existing message plus one line about generation, force-push `main`, find the Pages run by head SHA, `gh run watch <id> -R smaltra/soundix --exit-status`, check that the live bundle contains `Generate a sound`.

---

## Part 2: ElevenLabs direct, variants and session history

Spec §10–§11. Same constraints as above; execution inline.

### Task 6: Core — providers, ElevenLabs model, errors of both services, limited runner

**Files:** Modify `src/core/generate.ts`, `src/core/generate.test.ts`, `src/core/export.ts`.

- `type Provider = 'fal' | 'elevenlabs'`; `GenModel` gets `provider` and optional `terms`; `PROVIDERS: Record<Provider, { label: string; keyName: string; keyUrl: string }>`.
- New model `elevenlabs:eleven_text_to_sound_v2` → `{ text, duration_seconds, model_id: 'eleven_text_to_sound_v2' }`, url `https://elevenlabs.io/pricing`, terms `https://elevenlabs.io/terms-of-use`.
- `defaultModel(hasKey: (p: Provider) => boolean): GenModel`.
- `falError` → `apiError`: `detail` may also be an object with `message`; `quota` counts as balance.
- `type GenResult` moves here from the fal adapter.
- `runLimited<T>(tasks: (() => Promise<T>)[], limit: number, signal?: AbortSignal): Promise<(T | undefined)[]>`.
- `MAX_VARIANTS = 10`.
- CREDITS: `Terms:` uses `model.terms ?? model.url`.
- Tests: ElevenLabs input; ElevenLabs 401 and `quota_exceeded`; `defaultModel`; `runLimited` keeps at most `limit` running, keeps order, skips tasks after abort.

### Task 7: Adapters and keys

**Files:** Create `src/adapters/elevenlabs.ts`, `src/adapters/generate.ts`, `src/storage/api-keys.ts`; modify `src/adapters/fal.ts`; delete `src/storage/fal-key.ts`.

- `generateOnFal(modelId, input, key, signal)` (renamed), `generateElevenLabs(input, key, signal)`: one POST with `xi-api-key`, abort and a 2-minute timeout through one controller.
- `generate(model, input, key, signal)` picks the adapter by provider.
- `loadApiKey(p)`, `saveApiKey(p, key)`, `forgetApiKey(p)` under `soundix:<provider>-key`.

### Task 8: Variants stored in IndexedDB, shown in the dialog

**Files:** Create `src/storage/variants.ts`; modify `src/ui/hooks.ts`, `src/ui/store.tsx` (service `variants`); rewrite `src/ui/GenerateDialog.tsx`; modify `src/i18n/en.ts`, `src/ui/styles.css`.

- Storage: database `soundix-variants`, records `{ id, event, n, blob, duration, generated, added, savedId? }`; `loadVariants()` returns null when storage fails.
- Service: `list`, `add(event, blob, duration, generated)`, `markSaved(id, savedId)`, `remove(id)`, `clear(event)`, `importMany(items)`; numbers continue after the event's highest `n`.
- Dialog: models grouped by provider; key block of the selected provider; Variants 1–10; `runLimited` with limit 3; each result is decoded, stored and listed at once; the first result of a run plays; "Generating 4 of 10…"; Cancel aborts all; a key or balance error stops the rest; failures in one line; all variants of the event with #n, ▶, duration, Use / In use, ×; Clear with confirm; Use saves once into My sounds and assigns, the dialog stays open.

### Task 8b: Project ZIP

**Files:** Create `src/core/project.ts`, `src/core/project.test.ts`; modify `src/core/soundix-json.ts`, `src/core/export.ts`, `src/core/agent.ts`, `src/adapters/zip.ts`, `src/ui/ExportDialog.tsx`, `src/ui/App.tsx`, `src/ui/Header.tsx`, `src/i18n/en.ts`.

- Export: checkbox "Include all variants (N)"; files `variants/<event>/<n>.<ext>`; `soundix.json` field `variants`; AGENT.md line about `variants/`.
- Import: `.zip` from the menu, drop and paste; `zipContents(json)` gives own files by event index and variants; own files go to My sounds and replace "missing"; variants go to the history; caps 500 files, 10 MB each; toast with counts; "The ZIP has no soundix.json."
- Tests: export paths and field, AGENT.md line, `zipContents` with junk.

### Task 9: Docs, browser check, publish

- README and llms.txt name both services and `elevenlabs:<model_id>`.
- Browser with faked fal and ElevenLabs: batch of 10 with at most 3 requests at once, partial failure, cancel mid-batch, Use #7 then #8, history after reopening and after reload, delete and Clear, two keys remembered separately, ElevenLabs 401 and quota; export with variants → clear storage → import the ZIP → set, own sounds and history back.
- Squash, force-push, watch Pages, check the live bundle.
