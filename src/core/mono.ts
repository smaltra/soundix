// Mono for interface sounds: generated sounds often lean to one side, and a game button should
// not. Channels are averaged and written as a plain 16-bit PCM WAV.

/** The average of all channels, so no side is louder than the other. */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]
  const length = Math.min(...channels.map((c) => c.length))
  const mixed = new Float32Array(length)
  for (const channel of channels) {
    for (let i = 0; i < length; i++) mixed[i] += channel[i]
  }
  for (let i = 0; i < length; i++) mixed[i] /= channels.length
  return mixed
}

/** A WAV file with one channel of 16-bit PCM samples; values past ±1 are clipped. */
export function monoWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const bytes = samples.length * 2
  const wav = new Uint8Array(44 + bytes)
  const view = new DataView(wav.buffer)
  const text = (at: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + bytes, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // size of the fmt chunk
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // one channel
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // bytes per second
  view.setUint16(32, 2, true) // bytes per sample frame
  view.setUint16(34, 16, true) // bits per sample
  text(36, 'data')
  view.setUint32(40, bytes, true)
  samples.forEach((v, i) => {
    const s = Math.max(-1, Math.min(1, v))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : Math.min(s * 0x8000, 0x7fff), true)
  })
  return wav
}
