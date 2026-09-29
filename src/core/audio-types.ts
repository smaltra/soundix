// File extensions and MIME types of sound files.

export const extOf = (path: string) => /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase() ?? ''

const EXTS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/opus': 'opus',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/webm': 'webm',
}

/** File extension for a MIME type ('' when unknown). */
export const extForType = (type: string) => EXTS[type.split(';')[0].trim()] ?? ''

const TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  webm: 'audio/webm',
}

/** MIME type for a file path by its extension ('' when unknown). */
export const typeForPath = (path: string) => TYPES[extOf(path)] ?? ''
