// prettier-ignore
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'e', є: 'ye', ж: 'zh', з: 'z',
  и: 'i', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '',
  ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

const MAX_LENGTH = 40

/** Lower-case Latin spelling: Cyrillic by table, accents dropped. */
export function transliterate(text: string): string {
  return Array.from(text.toLowerCase(), (ch) => CYRILLIC[ch] ?? ch)
    .join('')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
}

export const isFileName = (text: string) => /^[a-z0-9_]+$/.test(text)

/** A file name of [a-z0-9_] made from any text; 'sound' when nothing is left. */
export function toFileName(text: string): string {
  const name = transliterate(text)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/_+$/, '')
  return name || 'sound'
}

/** base, base_2, base_3…; the suffix fits in the length limit so toFileName keeps the name. */
export function uniqueFileName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  const withSuffix = (n: number) =>
    `${base.slice(0, MAX_LENGTH - `_${n}`.length).replace(/_+$/, '')}_${n}`
  let n = 2
  while (used.has(withSuffix(n))) n++
  return withSuffix(n)
}
