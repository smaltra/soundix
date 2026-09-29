// Mono from a decoded sound: the channels averaged into one, written as a WAV file.
import { downmix, monoWav } from '../core/mono'
import { decodeBlob } from './player'

/** One channel from an already decoded sound, as a WAV file. */
export function bufferToMonoWav(buffer: AudioBuffer): Blob {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  )
  return new Blob([monoWav(downmix(channels), buffer.sampleRate)], { type: 'audio/wav' })
}

/** A mono copy of a sound file; null when it has one channel already or cannot be decoded. */
export async function toMono(blob: Blob): Promise<Blob | null> {
  try {
    const buffer = await decodeBlob(blob)
    return buffer.numberOfChannels > 1 ? bufferToMonoWav(buffer) : null
  } catch {
    return null
  }
}
