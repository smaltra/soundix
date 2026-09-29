import { compressToEncodedURIComponent } from 'lz-string'
import { describe, expect, it } from 'vitest'
import { createElement } from './layout'
import { createEvent } from './set'
import { decodeShare, encodeShare } from './share'
import { event, plain } from './test-fixtures'

describe('share link v2', () => {
  it('restores events and the wireframe; own sounds come back missing', () => {
    const events = [
      event({
        file: 'click',
        name: 'Клик',
        sound: { kind: 'library', id: 'ui-audio/click1' },
        volume: 0.5,
        pitch: 0,
        words: ['click', 'tap'],
      }),
      event({ file: 'jump', sound: { kind: 'own', id: 'own:1', name: 'my-jump.wav' } }),
    ]
    const shop = createElement('window', 'Shop', [], [])
    const ui = [{ ...createElement('button', 'Buy', [shop], ['click']), opens: shop.id }, shop]
    const back = decodeShare(encodeShare({ events, ui }))
    const expected = events.map(plain)
    expected[1].sound = { kind: 'missing', label: 'my-jump.wav' }
    expect(back?.events.map(plain)).toEqual(expected)
    expect(back?.ui).toEqual(ui)
  })

  it('keeps a generated unique file name', () => {
    const first = createEvent('a'.repeat(40), [])
    const second = createEvent('a'.repeat(40), [first])
    expect(decodeShare(encodeShare({ events: [second], ui: [] }))?.events[0].file).toBe(second.file)
  })

  it('rejects a damaged link', () => {
    const link = (payload: object) => compressToEncodedURIComponent(JSON.stringify(payload))
    expect(decodeShare('not-a-link')).toBeNull()
    expect(decodeShare(link({ soundix: 2, events: [42, null], ui: [] }))).toBeNull()
    expect(decodeShare(link({ soundix: 2, events: [], ui: [{ kind: 'rocket' }] }))).toBeNull()
    expect(decodeShare(link({ soundix: 2, events: [{ name: 'Click' }], ui: [] }))).toBeNull()
    expect(decodeShare(link({ soundix: 2, events: [{ id: 'click' }], ui: null }))).toBeNull()
  })

  it('creates silent events referenced by a shared wireframe', () => {
    const payload = {
      soundix: 2,
      events: [],
      ui: [{ id: 'buy', kind: 'button', text: 'Buy', sounds: { press: 'purchase' } }],
    }
    const back = decodeShare(compressToEncodedURIComponent(JSON.stringify(payload)))
    expect(back?.events.map(({ file, sound }) => ({ file, sound }))).toEqual([
      { file: 'purchase', sound: null },
    ])
  })
})
