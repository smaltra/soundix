import { describe, expect, it } from 'vitest'
import { reducer, type AppState } from '../ui/state'
import { downmix, monoWav } from './mono'
import { event } from './test-fixtures'

describe('mono', () => {
  it('mixes channels into their average', () => {
    // The right channel is twice as loud: after the mix both speakers get the same.
    const left = new Float32Array([0.2, -0.4, 1])
    const right = new Float32Array([0.4, -0.8, 1])
    expect([...downmix([left, right])].map((v) => Math.round(v * 100) / 100)).toEqual([
      0.3, -0.6, 1,
    ])
    expect(downmix([left])).toEqual(left)
  })

  it('writes a 16-bit mono WAV at the same rate', () => {
    const wav = monoWav(new Float32Array([0, 0.5, -1, 2]), 44100)
    const view = new DataView(wav.buffer)
    const text = (at: number) => String.fromCharCode(...wav.slice(at, at + 4))
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
    expect(view.getUint32(4, true)).toBe(wav.length - 8)
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // one channel
    expect(view.getUint32(24, true)).toBe(44100)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(8)
    // Samples: 0, half, full negative, and an overshoot clipped to full positive.
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      0, 16384, -32768, 32767,
    ])
  })

  it('keeps the new name of a sound made mono through undo and redo', () => {
    const click = event({
      file: 'click',
      sound: { kind: 'own', id: 'own:click', name: 'click-ai.mp3' },
    })
    let state: AppState = {
      events: [click],
      ui: [],
      backup: null,
      currentKey: click.key,
      selectedId: null,
      panel: 'sound',
      favorites: [],
      listenVolume: 1,
      history: { past: [], future: [], lastStep: null },
      example: null,
    }
    state = reducer(state, { type: 'update', key: click.key, patch: { volume: 0.4 } })
    state = reducer(state, { type: 'update', key: click.key, patch: { pitch: 0.1 } })
    state = reducer(state, { type: 'undo' })
    state = reducer(state, { type: 'ownRenamed', id: 'own:click', name: 'click-ai.wav' })

    const names = []
    for (const type of ['undo', 'redo', 'redo'] as const) {
      state = reducer(state, { type })
      const sound = state.events[0].sound
      names.push(sound?.kind === 'own' ? sound.name : null)
    }
    expect(names).toEqual(['click-ai.wav', 'click-ai.wav', 'click-ai.wav'])
  })
})
