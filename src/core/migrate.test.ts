import { describe, expect, it } from 'vitest'
import { fromV2 } from './migrate'

describe('sets from soundix:v2', () => {
  it('moves a changed set as the own set and ignores damaged data', () => {
    const saved = {
      events: [{ name: 'Click', file: 'click', sound: { kind: 'library', id: 'ui-audio/click2' } }],
      ui: [],
      favorites: [],
    }
    expect(fromV2(saved)).toEqual({ ...saved, example: null })
    expect(fromV2(null)).toBeNull()
    expect(fromV2({ ui: [] })).toBeNull()
  })
})
