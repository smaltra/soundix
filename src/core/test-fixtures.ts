// Fixtures for src/core tests only.
import type { Library, SoundEvent } from './types'

let n = 0
export const event = (e: Partial<SoundEvent>): SoundEvent => ({
  key: `k${n++}`,
  name: e.file ?? 'event',
  file: 'event',
  sound: null,
  volume: 0.8,
  pitch: 0.05,
  words: [],
  ...e,
})

/** An event without its random key, for comparisons. */
export const plain = ({ key: _key, ...rest }: SoundEvent) => rest

const RETRO_COIN = 'retro-512/general-sounds/coins/sfx_coin_single1'

export const library: Library = {
  version: 1,
  packs: [
    {
      id: 'ui-audio',
      name: 'UI Audio',
      author: 'Kenney',
      url: 'https://kenney.nl/assets/ui-audio',
      license: 'CC0',
    },
    {
      id: 'retro-512',
      name: '512 Retro (8-bit)',
      author: 'Juhani Junkala',
      url: 'https://opengameart.org/content/512-sound-effects-8-bit-style',
      license: 'CC0',
    },
    {
      id: 'unused-pack',
      name: 'Unused Pack',
      author: 'Nobody',
      url: 'https://example.com',
      license: 'CC0',
    },
  ],
  sounds: [
    {
      id: 'ui-audio/click1',
      pack: 'ui-audio',
      name: 'click1',
      tags: [],
      duration: 0.2,
      preview: 'ui-audio/click1.ogg',
      original: 'ui-audio/click1.ogg',
    },
    {
      id: RETRO_COIN,
      pack: 'retro-512',
      name: 'sfx_coin_single1',
      tags: ['general sounds', 'coins'],
      duration: 0.4,
      preview: `${RETRO_COIN}.ogg`,
      original: `${RETRO_COIN}.wav`,
    },
  ],
}

/** click: WAV original; win: OGG; my_jump: own MP3; silent: no sound. */
export const sampleEvents = () => [
  event({
    file: 'click',
    name: 'Клик',
    sound: { kind: 'library', id: RETRO_COIN },
    words: ['click'],
  }),
  event({
    file: 'win',
    name: 'Win',
    sound: { kind: 'library', id: 'ui-audio/click1' },
    volume: 1,
    pitch: 0,
  }),
  event({
    file: 'my_jump',
    name: 'Прыжок',
    sound: { kind: 'own', id: 'own:1', name: 'my-jump.mp3' },
  }),
  event({ file: 'silent', name: 'Silent', sound: null }),
]
