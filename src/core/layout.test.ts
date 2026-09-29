import { describe, expect, it } from 'vitest'
import { createElement, optionsOf, renameEventInUi, sanitizeUi } from './layout'

describe('wireframe elements', () => {
  it('new elements get an id from their text and the default events the set has', () => {
    const shop = createElement('button', 'Shop', [], ['click'])
    expect(shop.id).toBe('shop_button')
    expect(shop.sounds).toEqual({ press: 'click' })
    const again = createElement('button', 'Shop', [shop], [])
    expect(again.id).toBe('shop_button_2')
    expect(createElement('window', 'Магазин', [], ['open', 'close', 'select']).sounds).toEqual({
      open: 'open',
      close: 'close',
      select: 'select',
    })
    // Controls fall back to the first default event the set has.
    expect(createElement('input', 'Name', [], ['click', 'select']).sounds).toEqual({
      focus: 'click',
      type: 'click',
      submit: 'select',
    })
  })

  it('renaming an event moves the element sounds bound to it', () => {
    const ui = [createElement('button', 'Buy', [], ['click', 'hover'])]
    expect(renameEventInUi(ui, 'click', 'buy_click')[0].sounds).toEqual({
      press: 'buy_click',
      hover: 'hover',
    })
  })

  it('puts elements into the window they sit in when the file does not say', () => {
    const win = { id: 'shop_window', kind: 'window', text: 'Shop', x: 0.2, y: 0.1, w: 0.6, h: 0.7 }
    const inside = { id: 'buy', kind: 'button', text: 'Buy', x: 0.3, y: 0.3, w: 0.2, h: 0.1 }
    const close = {
      id: 'shop_close',
      kind: 'button',
      text: 'Close',
      x: 0.7,
      y: 0.12,
      w: 0.05,
      h: 0.08,
    }
    // "Close" as a word or an id part closes; inside another word it does not.
    const terms = { ...inside, id: 'terms', text: 'Disclose terms', y: 0.5 }
    const hud = { id: 'play', kind: 'button', text: 'Play', x: 0.85, y: 0.85, w: 0.1, h: 0.1 }
    const ui = sanitizeUi([win, inside, close, terms, hud])
    expect(ui?.map((el) => [el.id, el.parent, el.closes])).toEqual([
      ['shop_window', undefined, undefined],
      ['buy', 'shop_window', undefined],
      ['shop_close', 'shop_window', true],
      ['terms', 'shop_window', undefined],
      ['play', undefined, undefined],
    ])
    // A file that names parents is taken as it is.
    const named = sanitizeUi([win, { ...inside, parent: null }])
    expect(named?.[1].parent).toBeUndefined()
  })

  it('rejects unknown kinds and cleans the rest', () => {
    expect(sanitizeUi([{ kind: 'rocket' }])).toBeNull()
    expect(sanitizeUi({})).toBeNull()
    const ui = sanitizeUi([
      {
        id: 'Play Now',
        kind: 'button',
        text: 'Play',
        x: -1,
        y: 2,
        w: 0.2,
        h: 0.1,
        opens: 'nowhere',
        sounds: { press: 'click', open: 'x' },
      },
    ])
    expect(ui?.[0]).toMatchObject({ id: 'play_now', x: 0, sounds: { press: 'click' } })
    expect(ui?.[0].opens).toBeUndefined()
  })

  it('keeps an opens target when a later element repeats its id', () => {
    const ui = sanitizeUi([
      { id: 'shop', kind: 'window', text: 'Shop' },
      { id: 'shop', kind: 'label', text: 'Shop label' },
      { id: 'buy', kind: 'button', text: 'Buy', opens: 'shop' },
    ])
    expect(ui?.[2].opens).toBe('shop')
  })

  it('keeps an explicit close action when its window is inferred', () => {
    const ui = sanitizeUi([
      { id: 'shop', kind: 'window', x: 0.2, y: 0.1, w: 0.6, h: 0.7 },
      {
        id: 'later',
        kind: 'button',
        text: 'Later',
        x: 0.3,
        y: 0.3,
        w: 0.15,
        h: 0.1,
        closes: true,
      },
    ])
    expect(ui?.[1]).toMatchObject({ parent: 'shop', closes: true })
  })

  it('keeps an authored single option instead of replacing it with mock options', () => {
    const ui = sanitizeUi([{ id: 'quality', kind: 'dropdown', text: 'Ultra' }])
    expect(optionsOf(ui![0].text)).toEqual(['Ultra'])
  })
})
