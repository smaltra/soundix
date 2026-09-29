import { useEffect, useRef, useState } from 'react'
import { generate } from '../adapters/generate'
import { bufferToMonoWav, toMono } from '../audio/mono'
import { decodeBlob, loadBuffer, playBuffer } from '../audio/player'
import {
  DEFAULT_INFLUENCE,
  DEFAULT_SECONDS,
  defaultModel,
  GEN_MODELS,
  generatedName,
  inputFor,
  cleanKey,
  keyFor,
  keyService,
  MAX_SECONDS,
  MAX_VARIANTS,
  MIN_SECONDS,
  modelById,
  PROVIDERS,
  promptFor,
  resultType,
  runLimited,
  type GenError,
  type GenStatus,
  type Provider,
} from '../core/generate'
import type { Generated, SoundEvent } from '../core/types'
import { forgetApiKey, loadApiKey, saveApiKey } from '../storage/api-keys'
import type { StoredOwnSound } from '../storage/own-sounds'
import type { StoredVariant } from '../storage/variants'
import { copyOf } from '../core/variant-copy'
import { Dialog } from './Dialog'
import type { NewVariant, VariantCopy } from './hooks'
import { Icon } from './icons'
import { formatDuration } from './sounds'
import { useApp, useServices } from './store'

// Kept for this tab: the keys typed in and the last model, variants and prompt influence.
const tabKeys: Record<Provider, string> = { fal: '', elevenlabs: '' }
let lastModel = ''
let lastCount = 1
let lastInfluence = DEFAULT_INFLUENCE
/** The list below shows every generated sound, or only this event's */
let lastScope: 'all' | 'event' = 'all'
/** Generated sounds are mixed to mono unless the person turns it off */
let lastMono = true
type MonoResult = { result: 'made' | 'mono' | 'failed'; sound: StoredOwnSound }

// One generation run at a time across dialogs: paid requests never go on unseen.
let activeRun: AbortController | null = null

/** Requests running at once; the rest wait. */
const AT_ONCE = 3
const PROVIDER_LIST = Object.keys(PROVIDERS) as Provider[]

const keyAt = (p: Provider) => tabKeys[p] || loadApiKey(p)
const perProvider = <T,>(fn: (p: Provider) => T) =>
  Object.fromEntries(PROVIDER_LIST.map((p) => [p, fn(p)])) as Record<Provider, T>

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function GenerateDialog({ event, onClose }: { event: SoundEvent; onClose: () => void }) {
  const { state, dispatch, t } = useApp()
  const { own, variants, copies, toast } = useServices()
  const [prompt, setPrompt] = useState(() => promptFor(event))
  const [modelId, setModelId] = useState(() => lastModel || defaultModel((p) => keyAt(p) !== '').id)
  const [seconds, setSeconds] = useState(DEFAULT_SECONDS)
  const [count, setCount] = useState(lastCount)
  const [influence, setInfluence] = useState(lastInfluence)
  const [scope, setScope] = useState(lastScope)
  const [mono, setMono] = useState(lastMono)
  const [converting, setConverting] = useState(false)
  const [info, setInfo] = useState('')
  // Set when a pasted key belonged to the other service and Soundix switched to it.
  const [movedTo, setMovedTo] = useState<Provider | null>(null)
  const [keys, setKeys] = useState(() => perProvider(keyAt))
  const [remember, setRemember] = useState(() => perProvider((p) => loadApiKey(p) !== ''))
  const [editing, setEditing] = useState(() => perProvider((p) => keyAt(p) === ''))
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  // Where the requests are, and how long the run has taken: a long wait is never a silent one.
  const [stage, setStage] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [failure, setFailure] = useState<{ n: number; total: number; text: string } | null>(null)
  const running = useRef<AbortController | null>(null)
  const [saving, setSaving] = useState(false)

  const model = modelById(modelId) ?? GEN_MODELS[0]
  const provider = model.provider
  const service = PROVIDERS[provider]
  const key = keys[provider]
  const models = GEN_MODELS.filter((m) => m.provider === provider)
  // Only a key of this service's own shape goes out; anything else stays here with a reason.
  const check = keyFor(key, provider)
  // One pool of everything generated, newest first; any sound in it can be used for this event.
  const ownVariants = variants.list.filter((v) => v.event === event.file)
  const pool = (scope === 'all' ? variants.list : ownVariants)
    .slice()
    .sort((a, b) => b.added - a.added)
  const inUse = event.sound?.kind === 'own' ? event.sound.id : null

  const errorText = (code: GenError, diag?: string) =>
    [t.genErrors[code](service.label), diag && `(${diag})`].filter(Boolean).join(' ')

  /** One line for the requests in flight: the one furthest along speaks for all. */
  const stageText = (all: GenStatus[]) => {
    if (all.some((s) => s.phase === 'download')) return t.genStage.download
    if (all.some((s) => s.phase === 'running')) return t.genStage.running
    const ahead = all.flatMap((s) => (s.phase === 'queue' ? [s.position ?? -1] : []))
    if (ahead.length) {
      const known = ahead.filter((p) => p >= 0)
      return t.genStage.queue(known.length ? Math.min(...known) : null)
    }
    return t.genStage.send(service.label)
  }

  const runningNow = progress !== null
  useEffect(() => {
    if (!runningNow) return
    const start = Date.now()
    setElapsed(0)
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [runningNow])

  const play = (v: StoredVariant) =>
    loadBuffer(v.id, () => v.blob.arrayBuffer())
      .then((buffer) => playBuffer(buffer, event.volume * state.listenVolume, 0))
      .catch(() => undefined)

  const pickModel = (id: string) => {
    setModelId(id)
    lastModel = id
    setMovedTo(null)
  }

  const pickProvider = (p: Provider) => {
    const first = GEN_MODELS.find((m) => m.provider === p)
    if (first && p !== provider) pickModel(first.id)
  }

  /** A pasted key of the other service goes to that service, which gets picked. */
  const setKey = (value: string) => {
    const belongs = keyService(value)
    if (belongs && belongs !== provider) {
      setKeys((k) => ({ ...k, [belongs]: cleanKey(value) }))
      setEditing((e) => ({ ...e, [belongs]: true }))
      pickProvider(belongs)
      setMovedTo(belongs)
      return
    }
    setKeys((k) => ({ ...k, [provider]: value }))
  }

  const toggleRemember = (on: boolean) => {
    setRemember((r) => ({ ...r, [provider]: on }))
    if (on && check.ok) saveApiKey(provider, check.key)
    if (!on) forgetApiKey(provider)
  }

  const forget = () => {
    tabKeys[provider] = ''
    forgetApiKey(provider)
    setKey('')
    setRemember((r) => ({ ...r, [provider]: false }))
    setEditing((e) => ({ ...e, [provider]: true }))
  }

  /**
   * Decodes a result and stores it as a variant of this event: the variant, or the text of why
   * it was not kept; undefined when Cancel came while it was decoding, so nothing is kept.
   */
  const keep = async (
    blob: Blob,
    contentType: string,
    url: string,
    generated: Generated,
    signal: AbortSignal,
    toOneChannel: boolean,
  ): Promise<StoredVariant | string | undefined> => {
    // The type decides the file extension on Use and in the export: MIME, else URL, else mp3.
    const typed = new Blob([blob], { type: resultType(contentType || blob.type, url) })
    let kept: NewVariant
    try {
      const buffer = await decodeBlob(typed)
      const duration = Math.round(buffer.duration * 100) / 100
      // Generated sounds often lean to one side; mono plays the same in both speakers.
      const file = toOneChannel && buffer.numberOfChannels > 1 ? bufferToMonoWav(buffer) : typed
      kept = { event: event.file, blob: file, duration, generated }
    } catch {
      return signal.aborted ? undefined : errorText('bad-audio')
    }
    if (signal.aborted) return undefined
    const variant = await variants.add(kept)
    if (!variant) return t.genSaveFailed
    // Cancel came while it was being stored: it goes again, unheard.
    if (signal.aborted) {
      void variants.remove(variant.id).then(deleted)
      return undefined
    }
    return variant
  }

  const run = async () => {
    if (!check.ok || !prompt.trim() || progress) return
    const k = check.key
    tabKeys[provider] = k
    if (remember[provider]) saveApiKey(provider, k)
    setEditing((e) => ({ ...e, [provider]: false }))
    const total = count
    activeRun?.abort()
    const controller = new AbortController()
    activeRun = controller
    running.current = controller
    setProgress({ done: 0, total })
    setFailure(null)
    const input = inputFor(model, prompt, seconds, influence)
    const generated = { model: model.id, prompt: prompt.trim() }
    const toOneChannel = mono
    const fail = (text: string) => setFailure((f) => ({ n: (f?.n ?? 0) + 1, total, text }))
    let played = false
    const statuses = new Map<number, GenStatus>()
    const report = (id: number, status: GenStatus | null) => {
      if (status) statuses.set(id, status)
      else statuses.delete(id)
      setStage(stageText([...statuses.values()]))
    }
    setStage('')

    const one = async (id: number) => {
      const result = await generate(model, input, k, controller.signal, (s) => report(id, s))
      report(id, null)
      // After Cancel nothing is kept, even a result that arrives late.
      if (controller.signal.aborted) return
      if (result.ok) {
        const variant = await keep(
          result.blob,
          result.contentType,
          result.url,
          generated,
          controller.signal,
          toOneChannel,
        )
        if (variant === undefined) return
        if (typeof variant === 'string') fail(variant)
        else if (!played) {
          played = true
          void play(variant)
        }
      } else if (result.error !== 'cancelled') {
        // The same key or balance would fail every other request too.
        if (result.error === 'key' || result.error === 'balance') controller.abort()
        fail(errorText(result.error, result.diag))
      }
      setProgress((p) => p && { ...p, done: p.done + 1 })
    }

    await runLimited(
      Array.from({ length: total }, (_, i) => () => one(i)),
      AT_ONCE,
      controller.signal,
    )
    running.current = null
    if (activeRun === controller) activeRun = null
    setProgress(null)
  }

  // The dialog can vanish without Close (an import changes the event): the run stops with it.
  useEffect(() => () => running.current?.abort(), [])

  /**
   * Mixes one copy in My sounds to mono. It is stored first; only then does the set follow its
   * new .wav name. Nothing changes when storage refuses.
   */
  const monoCopy = async (copy: StoredOwnSound): Promise<MonoResult> => {
    const monoBlob = await toMono(copy.blob)
    if (!monoBlob) return { result: 'mono', sound: copy }
    const next = await own.replaceBlob(
      copy.id,
      monoBlob,
      copy.name.replace(/\.[^.]+$/, '') + '.wav',
    )
    if (!next) return { result: 'failed', sound: copy }
    dispatch({ type: 'ownRenamed', id: next.id, name: next.name })
    return { result: 'made', sound: next }
  }

  const monoVariant = async (v: StoredVariant): Promise<MonoResult['result']> => {
    const monoBlob = await toMono(v.blob)
    if (!monoBlob) return 'mono'
    return (await variants.replaceBlob(v.id, monoBlob)) ? 'made' : 'failed'
  }

  /**
   * One write for a variant after a Use: its mono file, and the link to its copy when the variant
   * does not hold it yet. False only when the mono file was not stored; a missing link on this
   * side is harmless, as the copy names the variant.
   */
  const followCopy = async (v: StoredVariant, copy: StoredOwnSound, monoBlob: Blob | null) => {
    if (!monoBlob && v.savedId === copy.id) return true
    return (await variants.markSaved(v.id, copy.id, monoBlob ?? undefined)) || !monoBlob
  }

  /** Stores a copy of a variant in My sounds, born naming its variant; or why Use failed. */
  const saveCopy = async (v: StoredVariant): Promise<NonNullable<VariantCopy> | string> => {
    // With Mono on, an older stereo variant is kept as mono: the copy first, then itself.
    const monoBlob = mono ? await toMono(v.blob) : null
    const blob = monoBlob ?? v.blob
    const taken = own.list.map((s) => s.name)
    const name = generatedName(event.file, taken, blob.type, '')
    const sound = await own.addBlob(blob, name, v.generated, v.id)
    if (sound === 'unplayable') return errorText('bad-audio')
    if (sound === 'refused') return t.genSaveFailed
    return { sound, note: (await followCopy(v, sound, monoBlob)) ? '' : t.genVariantStereo }
  }

  const use = async (v: StoredVariant) => {
    let saved = copyOf(v, own.list)
    let note = ''
    let madeHere = false
    if (!saved) {
      let failed = t.genSaveFailed
      setSaving(true)
      // A copy on its way, from another Use or an import, is waited for and never made twice.
      const copy = await copies
        .run(v.id, async () => {
          const result = await saveCopy(v)
          if (typeof result === 'string') {
            failed = result
            return null
          }
          madeHere = true
          return result
        })
        .finally(() => setSaving(false))
      if (!copy) return setFailure({ n: 1, total: 1, text: failed })
      saved = copy.sound
      note = copy.note
    }
    // A copy made before (or by someone else) may be stereo, and its variant may not link it yet.
    if (!madeHere) {
      let monoBlob: Blob | null = null
      if (mono) {
        const done = await monoCopy(saved)
        if (done.result === 'failed') return setFailure({ n: 1, total: 1, text: t.genSaveFailed })
        saved = done.sound
        monoBlob = await toMono(v.blob)
      }
      if (!(await followCopy(v, saved, monoBlob))) note = t.genVariantStereo
    }
    // Deleted from My sounds while it was being saved: nothing to assign.
    if (own.isGone(saved.id)) return setFailure({ n: 1, total: 1, text: t.genSaveFailed })
    dispatch({
      type: 'assign',
      key: event.key,
      sound: { kind: 'own', id: saved.id, name: saved.name, generated: v.generated },
    })
    if (note) setInfo(note)
  }

  /**
   * Mixes to mono every generated copy in My sounds (what events play) and every variant, one by
   * one. Each is picked by its own channels, so a retry finishes what failed before.
   */
  const makeAllMono = async () => {
    setConverting(true)
    setInfo('')
    let made = 0
    let failed = 0
    const count = (result: MonoResult['result']) => {
      if (result === 'made') made++
      if (result === 'failed') failed++
    }
    for (const copy of own.list.filter((s) => s.generated)) count((await monoCopy(copy)).result)
    for (const v of variants.list) count(await monoVariant(v))
    setConverting(false)
    setInfo(failed > 0 ? t.genMonoFailed(made, made + failed, failed) : t.genMadeMono(made))
  }

  const pickScope = (next: 'all' | 'event') => {
    setScope(next)
    lastScope = next
  }

  /**
   * Tells how many deleted sounds storage kept: they come back after reload. An app toast, as the
   * dialog may be closed by the time storage answers.
   */
  const deleted = (kept: number) => {
    if (kept > 0) toast(t.deleteFailed(kept))
  }

  const clear = () => {
    const all = scope === 'all'
    const text = all ? t.genClearAllConfirm(pool.length) : t.genClearConfirm(pool.length)
    if (window.confirm(text)) void variants.clear(all ? undefined : event.file).then(deleted)
  }

  const close = () => {
    running.current?.abort()
    onClose()
  }

  return (
    <Dialog open title={t.generateTitle(event.name || event.file)} onClose={close}>
      <div className="gen">
        <label className="field">
          <span>{t.genPrompt}</span>
          <textarea
            rows={3}
            maxLength={500}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <small>{t.genPromptHint}</small>
        </label>

        <div className="field">
          <span>{t.genService}</span>
          <div className="gen-service">
            <div className="seg" role="group" aria-label={t.genService}>
              {PROVIDER_LIST.map((p) => (
                <button key={p} aria-pressed={p === provider} onClick={() => pickProvider(p)}>
                  {PROVIDERS[p].label}
                  {keys[p].trim() && <span className="gen-dot" title={t.genHasKey} />}
                </button>
              ))}
            </div>
            {models.length > 1 ? (
              <select
                aria-label={t.genModel}
                value={model.id}
                onChange={(e) => pickModel(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="gen-model">{model.label}</span>
            )}
          </div>
          <small>
            <a href={model.url} target="_blank" rel="noreferrer">
              {t.genTerms}
            </a>
            {model.note && ` · ${model.note[0].toUpperCase()}${model.note.slice(1)}`}
          </small>
        </div>

        {editing[provider] ? (
          <div className="field">
            <label className="field">
              <span>{service.keyName}</span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <small>
              <a href={service.keyUrl} target="_blank" rel="noreferrer">
                {t.genGetKey}
              </a>
              {` · ${t.genKeyNote(service.label)}`}
            </small>
            <label className="gen-check">
              <input
                type="checkbox"
                checked={remember[provider]}
                onChange={(e) => toggleRemember(e.target.checked)}
              />
              {t.genRemember}
            </label>
            {remember[provider] && <small>{t.genRememberNote}</small>}
          </div>
        ) : (
          <p className="gen-key">
            {t.genKeySaved(service.keyName, cleanKey(key).slice(-4))} ·{' '}
            <button
              className="link"
              onClick={() => setEditing((e) => ({ ...e, [provider]: true }))}
            >
              {t.genChange}
            </button>{' '}
            ·{' '}
            <button className="link" onClick={forget}>
              {t.genForget}
            </button>
          </p>
        )}
        {movedTo === provider && check.ok && (
          <p className="gen-info">{t.genMovedKey(PROVIDERS[provider].label)}</p>
        )}
        {!check.ok && check.reason !== 'empty' && (
          <p className="gen-error" role="alert">
            {check.reason === 'other'
              ? t.genWrongKey(PROVIDERS[check.owner].label)
              : t.genUnknownKey(service.label)}
          </p>
        )}

        <div className="gen-sliders">
          <label className="field">
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
          <label className="field">
            <span>{t.genVariants(count)}</span>
            <input
              type="range"
              min={1}
              max={MAX_VARIANTS}
              step={1}
              value={count}
              onChange={(e) => {
                setCount(Number(e.target.value))
                lastCount = Number(e.target.value)
              }}
            />
          </label>
          {model.influence && (
            <label className="field">
              <span>{t.genInfluence(influence)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={influence}
                onChange={(e) => {
                  setInfluence(Number(e.target.value))
                  lastInfluence = Number(e.target.value)
                }}
              />
              <small className="gen-scale">
                <span>{t.genFreer}</span>
                <span>{t.genStricter}</span>
              </small>
            </label>
          )}
        </div>

        <label className="gen-check">
          <input
            type="checkbox"
            checked={mono}
            onChange={(e) => {
              setMono(e.target.checked)
              lastMono = e.target.checked
            }}
          />
          {t.genMono}
        </label>

        <div className="dialog-actions">
          <small className="muted">{t.genCost(service.label, count)}</small>
          {progress && (
            <button className="btn" onClick={() => running.current?.abort()}>
              {t.genCancel}
            </button>
          )}
          <button
            className="btn primary"
            disabled={!!progress || !check.ok || !prompt.trim()}
            onClick={run}
          >
            {progress ? t.genRunning(progress.done, progress.total) : t.genRun(count)}
          </button>
        </div>
        {progress && (
          <p className="gen-stage muted" aria-live="polite">
            {[stage, clock(elapsed)].filter(Boolean).join(' · ')}
          </p>
        )}
        {failure && (
          <p className="gen-error" role="alert">
            {failure.total > 1 ? t.genFailed(failure.n, failure.total, failure.text) : failure.text}
          </p>
        )}
        {variants.list.length > 0 && (
          <div className="gen-history">
            <div className="gen-history-head">
              <div className="seg" role="group" aria-label={t.genPool}>
                <button aria-pressed={scope === 'all'} onClick={() => pickScope('all')}>
                  {t.genAll(variants.list.length)}
                </button>
                <button aria-pressed={scope === 'event'} onClick={() => pickScope('event')}>
                  {t.genThisEvent(ownVariants.length)}
                </button>
              </div>
              <span className="gen-history-actions">
                <button className="link" disabled={converting} onClick={makeAllMono}>
                  {converting ? t.genMakingMono : t.genMakeMono}
                </button>
                {pool.length > 0 && (
                  <button className="link" onClick={clear}>
                    {t.genClear}
                  </button>
                )}
              </span>
            </div>
            {info && <p className="gen-info">{info}</p>}
            {pool.length === 0 && <p className="muted">{t.genNoneForEvent}</p>}
            <ul className="gen-results">
              {pool.map((v) => {
                const used = inUse !== null && copyOf(v, own.list)?.id === inUse
                const label = modelById(v.generated.model)?.label ?? v.generated.model
                return (
                  <li key={v.id} className={used ? 'in-use' : undefined}>
                    <span className="gen-n">#{v.n}</span>
                    <button
                      className="play"
                      aria-label={`${t.play} #${v.n}`}
                      onClick={() => play(v)}
                    >
                      <Icon name="play" size={11} />
                    </button>
                    {v.event !== event.file && (
                      <span className="gen-from" title={t.genFrom(v.event)}>
                        {v.event}
                      </span>
                    )}
                    <span className="row-name" title={`${label}: ${v.generated.prompt}`}>
                      {v.generated.prompt}
                    </span>
                    <span className="row-dur">{formatDuration(v.duration)}</span>
                    {used ? (
                      <span className="gen-in-use">{t.genInUse}</span>
                    ) : (
                      <button className="btn small" disabled={saving} onClick={() => void use(v)}>
                        {t.genUse}
                      </button>
                    )}
                    <button
                      className="x"
                      aria-label={t.genDelete}
                      title={t.genDelete}
                      onClick={() => void variants.remove(v.id).then(deleted)}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  )
}
