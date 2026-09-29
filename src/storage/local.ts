// localStorage under one key. Without storage the app works and just forgets.
const KEY = 'soundix:v3'
/** The first public version; its set is read once when the current key is empty. */
const V2_KEY = 'soundix:v2'

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

export const loadSaved = () => read(KEY)
export const loadV2 = () => read(V2_KEY)

export function save(value: unknown) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // Storage is full or blocked: keep working without it.
  }
}
