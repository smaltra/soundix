// Web Audio playback: one AudioContext, created on the first user gesture, and decoded buffers
// cached by key. Every play gets its own source, so a sound can overlap itself.
import { sizedCache } from '../core/cache'

/** Decoded PCM kept at most; the least recently played buffers are decoded again when needed. */
const MAX_DECODED_BYTES = 64 * 1024 * 1024

let context: AudioContext | null = null
const decoded = sizedCache<AudioBuffer>(MAX_DECODED_BYTES, (b) => b.length * b.numberOfChannels * 4)
const decoding = new Map<string, Promise<AudioBuffer>>()

export const hasContext = () => context !== null

export function audioContext(): AudioContext {
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

/** Creates the context on the first pointer or key press, then calls onUnlock once. */
export function unlockOnFirstGesture(onUnlock: () => void): () => void {
  const types = ['pointerdown', 'keydown', 'touchend'] as const
  const unlock = () => {
    audioContext()
    stop()
    onUnlock()
  }
  const stop = () => types.forEach((t) => window.removeEventListener(t, unlock, true))
  types.forEach((t) => window.addEventListener(t, unlock, true))
  return stop
}

export function loadBuffer(key: string, fetchData: () => Promise<ArrayBuffer>) {
  const ready = decoded.get(key)
  if (ready) return Promise.resolve(ready)
  let job = decoding.get(key)
  if (!job) {
    const started = fetchData().then((data) => audioContext().decodeAudioData(data))
    job = started
    decoding.set(key, started)
    // A buffer forgotten while it was decoding is not cached.
    started.then(
      (buffer) => {
        if (decoding.get(key) !== started) return
        decoding.delete(key)
        decoded.set(key, buffer)
      },
      () => {
        if (decoding.get(key) === started) decoding.delete(key)
      },
    )
  }
  return job
}

/** Frees the decoded sound of a deleted variant or own sound. */
export function forgetBuffer(key: string) {
  decoding.delete(key)
  decoded.delete(key)
}

export const decodeBlob = async (blob: Blob) =>
  audioContext().decodeAudioData(await blob.arrayBuffer())

/** volume 0..1; pitch spread 0..0.2 around playbackRate 1. */
export function playBuffer(buffer: AudioBuffer, volume: number, pitch: number) {
  const ctx = audioContext()
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitch
  const gain = ctx.createGain()
  gain.gain.value = volume
  source.connect(gain).connect(ctx.destination)
  source.start()
}
