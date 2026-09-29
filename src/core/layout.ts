// The wireframe: buttons, controls, windows and labels on a 16:9 canvas that play the set's events.
import { isFileName, toFileName, uniqueFileName } from './names'

export const UI_KINDS = [
  'button',
  'toggle',
  'checkbox',
  'slider',
  'input',
  'dropdown',
  'tabs',
  'window',
  'label',
] as const
export type UiKind = (typeof UI_KINDS)[number]

export const UI_COLORS = ['gold', 'blue', 'green', 'purple', 'red', 'gray'] as const
export type UiColor = (typeof UI_COLORS)[number]

export type UiTrigger =
  'press' | 'hover' | 'change' | 'focus' | 'type' | 'submit' | 'open' | 'close' | 'select'
export type WindowContent = 'list' | 'grid'

/** What each kind of element sounds on. */
export const TRIGGERS: Record<UiKind, UiTrigger[]> = {
  button: ['press', 'hover'],
  toggle: ['change'],
  checkbox: ['change'],
  slider: ['change'],
  input: ['focus', 'type', 'submit'],
  dropdown: ['open', 'select'],
  tabs: ['select'],
  window: ['open', 'close', 'select'],
  label: [],
}

/** Events a new element plays on each trigger: the first one the set has. */
export const DEFAULT_EVENTS: Record<UiTrigger, string[]> = {
  press: ['click'],
  hover: ['hover'],
  change: ['toggle', 'click'],
  focus: ['focus', 'click'],
  type: ['type', 'tick', 'click'],
  submit: ['submit', 'select', 'click'],
  open: ['open'],
  close: ['close'],
  select: ['select', 'click'],
}

export interface UiElement {
  /** [a-z0-9_], unique in the wireframe */
  id: string
  kind: UiKind
  /**
   * Button, label, toggle, checkbox and slider text; window title; input placeholder;
   * dropdown options and tab names separated by commas
   */
  text: string
  emoji?: string
  color: UiColor
  /** Position and size as fractions of the canvas */
  x: number
  y: number
  w: number
  h: number
  /** Button: id of the window it opens */
  opens?: string
  /** Any element but a window: the window it sits in; shown only while that window is open */
  parent?: string
  /** Button inside a window: closes that window */
  closes?: boolean
  /** Window: mock rows or cells */
  content?: WindowContent
  /** Window: number of mock items */
  items?: number
  /** Trigger → event id; null is silent */
  sounds: Partial<Record<UiTrigger, string | null>>
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

const MIN_SIZE = 0.03
const MAX_TEXT = 80
const MAX_ITEMS = 60
const DEFAULT_ITEMS = 12

const DEFAULT_BOX: Record<UiKind, Box> = {
  button: { x: 0.45, y: 0.44, w: 0.1, h: 0.12 },
  toggle: { x: 0.42, y: 0.46, w: 0.16, h: 0.08 },
  checkbox: { x: 0.42, y: 0.46, w: 0.16, h: 0.08 },
  slider: { x: 0.38, y: 0.46, w: 0.24, h: 0.08 },
  input: { x: 0.37, y: 0.46, w: 0.26, h: 0.08 },
  dropdown: { x: 0.4, y: 0.46, w: 0.2, h: 0.08 },
  tabs: { x: 0.34, y: 0.46, w: 0.32, h: 0.08 },
  window: { x: 0.25, y: 0.15, w: 0.5, h: 0.7 },
  label: { x: 0.41, y: 0.465, w: 0.18, h: 0.07 },
}

const DEFAULT_COLOR: Record<UiKind, UiColor> = {
  button: 'blue',
  toggle: 'green',
  checkbox: 'blue',
  slider: 'gold',
  input: 'gray',
  dropdown: 'gray',
  tabs: 'gold',
  window: 'purple',
  label: 'gray',
}

/** Dropdown options and tab names: comma separated; mock ones only when there are none. */
export function optionsOf(text: string): string[] {
  const names = text
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)
  return names.length ? names : ['1', '2', '3']
}

const snap = (v: number) => Math.round(v * 100) / 100
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Keeps a box inside the canvas, no smaller than 3 %, on a 1 % grid. */
export function place(el: UiElement, box: Box): UiElement {
  const w = snap(clamp(box.w, MIN_SIZE, 1))
  const h = snap(clamp(box.h, MIN_SIZE, 1))
  return { ...el, w, h, x: snap(clamp(box.x, 0, 1 - w)), y: snap(clamp(box.y, 0, 1 - h)) }
}

/** "Shop" + button → shop_button, unique among taken ids. */
export function elementId(text: string, kind: UiKind, taken: Iterable<string>): string {
  const base = toFileName(kind === 'dropdown' || kind === 'tabs' ? optionsOf(text)[0] : text)
  const id = base === kind || base.endsWith(`_${kind}`) ? base : toFileName(`${base} ${kind}`)
  return uniqueFileName(id, taken)
}

export function createElement(
  kind: UiKind,
  text: string,
  ui: UiElement[],
  eventIds: string[],
): UiElement {
  const sounds: UiElement['sounds'] = {}
  for (const trigger of TRIGGERS[kind]) {
    const event = DEFAULT_EVENTS[trigger].find((id) => eventIds.includes(id))
    if (event) sounds[trigger] = event
  }
  const el: UiElement = {
    id: elementId(
      text,
      kind,
      ui.map((e) => e.id),
    ),
    kind,
    text,
    color: DEFAULT_COLOR[kind],
    ...DEFAULT_BOX[kind],
    sounds,
  }
  return kind === 'window' ? { ...el, content: 'grid', items: DEFAULT_ITEMS } : el
}

export function renameEventInUi(ui: UiElement[], from: string, to: string): UiElement[] {
  return ui.map((el) => {
    const sounds = { ...el.sounds }
    for (const trigger of TRIGGERS[el.kind]) if (sounds[trigger] === from) sounds[trigger] = to
    return { ...el, sounds }
  })
}

/** A new element id; buttons that opened the element and elements inside it follow it. */
export function renameElementInUi(ui: UiElement[], from: string, to: string): UiElement[] {
  return ui.map((el) => ({
    ...el,
    id: el.id === from ? to : el.id,
    opens: el.opens === from ? to : el.opens,
    parent: el.parent === from ? to : el.parent,
  }))
}

/** Removes an element, the elements inside it and the links of buttons that opened it. */
export function removeElement(ui: UiElement[], id: string): UiElement[] {
  return ui
    .filter((el) => el.id !== id && el.parent !== id)
    .map((el) => (el.opens === id ? { ...el, opens: undefined } : el))
}

const center = (el: Box) => ({ cx: el.x + el.w / 2, cy: el.y + el.h / 2 })
const contains = (outer: Box, inner: Box) => {
  const { cx, cy } = center(inner)
  return cx > outer.x && cx < outer.x + outer.w && cy > outer.y && cy < outer.y + outer.h
}
// "Close" as a whole word or an id part (shop_close), not inside another word (Disclose).
const CLOSE = /(^|[^a-z])close([^a-z]|$)|✕|×|❌|✖/i

/**
 * Files that say nothing about parents (older agents, older Soundix) get them by position: an
 * element sits in the last window before it in the file whose box holds its center. A button
 * there that plays "close" or reads "Close" closes that window.
 */
function inferParents(ui: UiElement[]): UiElement[] {
  return ui.map((el, i) => {
    if (el.kind === 'window') return el
    const home = ui
      .slice(0, i)
      .reverse()
      .find((w) => w.kind === 'window' && contains(w, el))
    if (!home) return el
    const closes =
      el.kind === 'button' &&
      (el.closes ||
        el.sounds.press === 'close' ||
        CLOSE.test(el.text) ||
        CLOSE.test(el.id) ||
        CLOSE.test(el.emoji ?? ''))
    return closes ? { ...el, parent: home.id, closes: true } : { ...el, parent: home.id }
  })
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const isKind = (v: unknown): v is UiKind => UI_KINDS.includes(v as UiKind)
const isColor = (v: unknown): v is UiColor => UI_COLORS.includes(v as UiColor)
const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

function soundsOf(kind: UiKind, raw: unknown): UiElement['sounds'] {
  const given = isObj(raw) ? raw : {}
  const sounds: UiElement['sounds'] = {}
  for (const trigger of TRIGGERS[kind]) {
    const v = given[trigger]
    if (v === null || (typeof v === 'string' && isFileName(v))) sounds[trigger] = v
  }
  return sounds
}

/** One element from untrusted data; the id is made unique against `taken`. */
function sanitizeElement(r: Obj & { kind: UiKind }, taken: string[]): UiElement {
  const text = str(r.text, MAX_TEXT)
  const rawId = str(r.id, MAX_TEXT)
  const id = rawId ? uniqueFileName(toFileName(rawId), taken) : elementId(text, r.kind, taken)
  const box = DEFAULT_BOX[r.kind]
  let el: UiElement = {
    id,
    kind: r.kind,
    text,
    color: isColor(r.color) ? r.color : 'gray',
    ...box,
    sounds: soundsOf(r.kind, r.sounds),
  }
  el = place(el, { x: num(r.x, box.x), y: num(r.y, box.y), w: num(r.w, box.w), h: num(r.h, box.h) })
  const emoji = str(r.emoji, 16).trim()
  if (emoji) el.emoji = emoji
  if (r.kind === 'window') {
    el.content = r.content === 'list' ? 'list' : 'grid'
    el.items = Math.round(clamp(num(r.items, DEFAULT_ITEMS), 1, MAX_ITEMS))
  }
  return el
}

/** A wireframe from untrusted data, or null when it is not a list of known elements. */
export function sanitizeUi(raw: unknown): UiElement[] | null {
  if (!Array.isArray(raw)) return null
  if (!raw.every((r) => isObj(r) && isKind(r.kind))) return null
  const ui: UiElement[] = []
  // Given id → final ids in file order; a repeated id gets a suffix but links keep the window.
  const ids = new Map<string, string[]>()
  for (const r of raw as (Obj & { kind: UiKind })[]) {
    const el = sanitizeElement(
      r,
      ui.map((e) => e.id),
    )
    if (typeof r.id === 'string') ids.set(r.id, [...(ids.get(r.id) ?? []), el.id])
    ui.push(el)
  }
  const windows = new Set(ui.filter((e) => e.kind === 'window').map((e) => e.id))
  const windowOf = (v: unknown) =>
    typeof v === 'string'
      ? (ids.get(v) ?? [toFileName(v)]).find((id) => windows.has(id))
      : undefined
  const linked = ui.map((el, i) => {
    const r = raw[i] as Obj
    const next = { ...el }
    const opens = el.kind === 'button' ? windowOf(r.opens) : undefined
    const parent = el.kind !== 'window' ? windowOf(r.parent) : undefined
    if (opens) next.opens = opens
    if (parent) next.parent = parent
    if (el.kind === 'button' && r.closes === true) next.closes = true
    return next
  })
  // Soundix writes "parent" for every element (null on the screen); files without it get guesses.
  const saysParents = raw.some((r) => 'parent' in (r as Obj))
  const placed = saysParents ? linked : inferParents(linked)
  // Only a button inside a window can close it.
  return placed.map(({ closes, ...el }) => (closes && el.parent ? { ...el, closes } : el))
}

/** The wireframe as plain JSON, keys in reading order. */
export const uiData = (ui: UiElement[]) =>
  ui.map(
    ({
      id,
      kind,
      text,
      emoji,
      color,
      x,
      y,
      w,
      h,
      opens,
      parent,
      closes,
      content,
      items,
      sounds,
    }) => ({
      id,
      kind,
      text,
      emoji,
      color,
      x,
      y,
      w,
      h,
      parent: parent ?? null,
      opens,
      closes,
      content,
      items,
      sounds,
    }),
  )
