// Browser side of the export and of project import: zip and unzip with JSZip, download.
import type JSZip from 'jszip'
import type { ExportFile } from '../core/export'
import { typeForPath } from '../core/generate'
import { MAX_ZIP_FILE_BYTES, MAX_ZIP_JSON_BYTES, MAX_ZIP_TOTAL_BYTES } from '../core/project'

export const libraryUrl = (path: string) =>
  `${import.meta.env.BASE_URL}library/${path.split('/').map(encodeURIComponent).join('/')}`

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.blob()
}

export async function buildZip(
  files: ExportFile[],
  ownBlob: (id: string) => Blob | undefined,
  variantBlob: (id: string) => Blob | undefined = () => undefined,
): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  await Promise.all(
    files.map(async (file) => {
      if ('text' in file) zip.file(file.path, file.text)
      else if ('url' in file) zip.file(file.path, await fetchBlob(libraryUrl(file.url)))
      else {
        const blob = 'own' in file ? ownBlob(file.own) : variantBlob(file.variant)
        if (!blob) throw new Error(`Sound not found: ${file.path}`)
        zip.file(file.path, blob)
      }
    }),
  )
  return zip.generateAsync({ type: 'blob' })
}

export interface OpenedZip {
  /** Text of soundix.json */
  json: string
  /** A sound file of the archive with its MIME type; null when absent or over a limit */
  sound: (path: string) => Promise<Blob | null>
}

// Present in JSZip at runtime, missing from its typings.
type Streamable = { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }

/**
 * Unpacks one entry and gives up as soon as it grows past `max` bytes: a small compressed file
 * can claim any size and unpack into gigabytes.
 */
function unpack(entry: JSZip.JSZipObject, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  return new Promise((resolve) => {
    const chunks: Uint8Array[] = []
    let size = 0
    let done = false
    const finish = (result: Uint8Array<ArrayBuffer> | null) => {
      done = true
      resolve(result)
    }
    let stream: JSZip.JSZipStreamHelper<Uint8Array>
    try {
      stream = (entry as unknown as Streamable).internalStream('uint8array')
    } catch {
      return finish(null)
    }
    stream
      .on('data', (chunk) => {
        if (done) return
        size += chunk.length
        if (size > max) {
          stream.pause()
          return finish(null)
        }
        chunks.push(chunk)
      })
      .on('error', () => finish(null))
      .on('end', () => {
        if (done) return
        const all = new Uint8Array(size)
        let at = 0
        for (const chunk of chunks) {
          all.set(chunk, at)
          at += chunk.length
        }
        finish(all)
      })
      .resume()
  })
}

/**
 * Opens a project ZIP; null without soundix.json. Throws when the file is not a ZIP or its
 * soundix.json is too large. Sound files share one budget, so the whole import stays bounded.
 */
export async function openZip(file: Blob): Promise<OpenedZip | null> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(file)
  const jsonEntry = zip.file('soundix.json')
  if (!jsonEntry) return null
  const json = await unpack(jsonEntry, MAX_ZIP_JSON_BYTES)
  if (!json) throw new Error('soundix.json is too large')
  let left = MAX_ZIP_TOTAL_BYTES
  return {
    json: new TextDecoder().decode(json),
    sound: async (path) => {
      const entry = zip.file(path)
      if (!entry || entry.dir || left <= 0) return null
      const data = await unpack(entry, Math.min(MAX_ZIP_FILE_BYTES, left))
      if (!data) return null
      left -= data.length
      return new Blob([data], { type: typeForPath(path) })
    },
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
