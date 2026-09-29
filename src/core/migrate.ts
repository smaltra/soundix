// Sets saved by the first public version of Soundix (localStorage "soundix:v2").

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const objects = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : [])

/**
 * That version's starter example exactly as it saved it: English and Russian names, before and
 * after a reload cleaned it. Computed from the example code of 79f7216.
 */
const UNTOUCHED_EXAMPLE = new Set(['d82470cd', '696888d3', '94f45fb2', 'bc9468fa'])

/** FNV-1a of every field of the saved events and wireframe, in a fixed order. */
function setFingerprint(set: Obj): string {
  const text = JSON.stringify([
    objects(set.events).map((e) => [e.name, e.file, e.sound, e.volume, e.pitch, e.words]),
    objects(set.ui).map((el) => [
      el.id,
      el.kind,
      el.text,
      el.emoji,
      el.color,
      el.x,
      el.y,
      el.w,
      el.h,
      el.opens,
      el.content,
      el.items,
      el.sounds,
    ]),
  ])
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(16)
}

/**
 * The saved state as the person's own set. Only the example nobody touched (same events,
 * wireframe, no backup set, no favorites) is dropped, so the current example replaces it.
 */
export function fromV2(raw: unknown): Obj | null {
  if (!isObj(raw) || !Array.isArray(raw.events)) return null
  const untouched =
    UNTOUCHED_EXAMPLE.has(setFingerprint(raw)) &&
    !raw.backup &&
    !(Array.isArray(raw.favorites) && raw.favorites.length)
  return untouched ? null : { ...raw, example: null }
}
