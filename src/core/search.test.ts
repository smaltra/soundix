import { describe, expect, it } from 'vitest'
import { suggestSounds } from './search'
import type { ListSound } from './types'

const sound = (id: string, name: string, tags: string[], duration: number): ListSound => ({
  id,
  pack: id.split('/')[0],
  name,
  tags,
  duration,
})

const sounds = [
  sound('a/tick', 'tick_001', [], 0.2),
  sound('b/click-long', 'click_long', [], 0.9),
  sound('b/click-short', 'Click2', [], 0.3),
  sound('c/coin', 'sfx_coin_single1', ['general sounds', 'coins'], 0.4),
  sound('d/boom', 'explosion', [], 1),
]

describe('suggestSounds', () => {
  it('ranks by the earliest matching word, then by shorter sound', () => {
    expect(suggestSounds(sounds, ['click', 'tick']).map((s) => s.id)).toEqual([
      'b/click-short',
      'b/click-long',
      'a/tick',
    ])
  })

  it('matches tags too, ignoring case', () => {
    expect(suggestSounds(sounds, ['COINS']).map((s) => s.id)).toEqual(['c/coin'])
  })

  it('suggests nothing without words', () => {
    expect(suggestSounds(sounds, [])).toEqual([])
  })
})
