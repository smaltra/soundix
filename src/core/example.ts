// The starter set: a light HUD (Shop and Settings with their windows) whose events already have sounds.
import type { UiElement } from './layout'
import { DEFAULT_PITCH, DEFAULT_VOLUME, newKey } from './set'
import type { Lang, SoundEvent } from './types'

interface ExampleEvent {
  file: string
  name: Record<Lang, string>
  sound: string
  words: string[]
  pitch?: number
}

// Search words are English because pack file names are. Earlier words rank higher.
// prettier-ignore
const EVENTS: ExampleEvent[] = [
  { file: 'click', name: { en: 'Click', ru: 'Клик' }, sound: 'ui-audio/click2', words: ['click', 'mouseclick', 'select', 'tap', 'tick', 'button', 'menu_select', 'menu confirm', 'blip', 'interface'] },
  { file: 'hover', name: { en: 'Hover', ru: 'Наведение' }, sound: 'ui-audio/rollover2', words: ['rollover', 'click', 'tick', 'glass', 'select', 'menu_move', 'menu move', 'blip'] },
  { file: 'open', name: { en: 'Open window', ru: 'Открытие окна' }, sound: 'interface-sounds/open_001', words: ['open', 'maximize', 'confirmation', 'drop', 'pluck', 'bookopen', 'phasejump', 'pause', 'transition', 'dooropen', 'portal'] },
  { file: 'close', name: { en: 'Close window', ru: 'Закрытие окна' }, sound: 'interface-sounds/close_001', words: ['close', 'minimize', 'back', 'drop', 'bookclose', 'pause', 'transition'] },
  { file: 'select', name: { en: 'Select', ru: 'Выбор' }, sound: 'interface-sounds/select_001', words: ['select', 'switch', 'click', 'tick', 'bookflip', 'card-slide', 'menu_move', 'interaction'] },
  { file: 'purchase', name: { en: 'Purchase', ru: 'Покупка' }, sound: 'retro-512/general-sounds/coins/sfx_coin_double1', words: ['coin', 'chips', 'handlecoins', 'confirmation', 'powerup', 'correct', 'coin_double', 'coin_cluster', 'fanfare'], pitch: 0 },
  { file: 'hit', name: { en: 'Enemy hit', ru: 'Удар врага' }, sound: 'impact-sounds/impactpunch_medium_000', words: ['punch', 'hit', 'impact', 'damage', 'swing'] },
]

function exampleEvents(lang: Lang): SoundEvent[] {
  return EVENTS.map((e) => ({
    key: newKey(),
    name: e.name[lang],
    file: e.file,
    sound: { kind: 'library', id: e.sound },
    volume: DEFAULT_VOLUME,
    pitch: e.pitch ?? DEFAULT_PITCH,
    words: [...e.words],
  }))
}

const BUTTON = { press: 'click', hover: 'hover' }

// Square buttons on a 16:9 canvas: h = w * 16 / 9.
const EXAMPLE_UI: UiElement[] = [
  {
    id: 'shop_button',
    kind: 'button',
    text: 'Shop',
    emoji: '🛒',
    color: 'gold',
    x: 0.03,
    y: 0.06,
    w: 0.1,
    h: 0.18,
    opens: 'shop_window',
    sounds: BUTTON,
  },
  {
    id: 'settings_button',
    kind: 'button',
    text: '',
    emoji: '⚙️',
    color: 'gray',
    x: 0.91,
    y: 0.04,
    w: 0.06,
    h: 0.11,
    opens: 'settings_window',
    sounds: BUTTON,
  },
  // Currencies, only for the look: labels make no sound.
  {
    id: 'coins_label',
    kind: 'label',
    text: '1 250',
    emoji: '💰',
    color: 'gold',
    x: 0.03,
    y: 0.76,
    w: 0.2,
    h: 0.08,
    sounds: {},
  },
  {
    id: 'gems_label',
    kind: 'label',
    text: '85',
    emoji: '💎',
    color: 'blue',
    x: 0.03,
    y: 0.86,
    w: 0.2,
    h: 0.08,
    sounds: {},
  },
  {
    id: 'shop_window',
    kind: 'window',
    text: 'Shop',
    color: 'gold',
    x: 0.3,
    y: 0.12,
    w: 0.4,
    h: 0.74,
    content: 'grid',
    items: 12,
    sounds: { open: 'open', close: 'close', select: 'purchase' },
  },
  {
    id: 'settings_window',
    kind: 'window',
    text: 'Settings',
    color: 'gray',
    x: 0.3,
    y: 0.12,
    w: 0.4,
    h: 0.74,
    content: 'list',
    items: 5,
    sounds: { open: 'open', close: 'close', select: 'select' },
  },
]

/** Raise when the example changes: an untouched saved example is then replaced by the new one. */
export const EXAMPLE_VERSION = 3

export function createExample(lang: Lang): { events: SoundEvent[]; ui: UiElement[] } {
  return { events: exampleEvents(lang), ui: EXAMPLE_UI.map((el) => ({ ...el })) }
}

/** An empty canvas with the events new elements use, without sounds. */
export function createEmpty(lang: Lang): { events: SoundEvent[]; ui: UiElement[] } {
  const events = exampleEvents(lang)
    .filter((e) => ['click', 'hover', 'open', 'close', 'select'].includes(e.file))
    .map((e) => ({ ...e, sound: null }))
  return { events, ui: [] }
}
