import { describe, expect, it } from 'vitest'
import { resolveEntries } from './entries'
import { createElement } from './layout'
import { buildSoundixJson, parseSoundixJson } from './soundix-json'
import { event, library, plain, sampleEvents } from './test-fixtures'

describe('soundix.json v2', () => {
  it('parses back events, silent events and the wireframe', () => {
    const events = sampleEvents()
    const ui = [createElement('button', 'Buy', [], ['click'])]
    const { entries } = resolveEntries(events, library, 'original')
    const back = parseSoundixJson(JSON.stringify(buildSoundixJson(events, entries, ui)), [])
    const expected = events.map(plain)
    expected[2].sound = { kind: 'missing', label: 'my-jump.mp3' }
    expect(back.ok && back.events.map(plain)).toEqual(expected)
    expect(back.ok && back.ui).toEqual(ui)
  })

  it('creates the events a wireframe-only file refers to and keeps the current ones', () => {
    const current = [event({ file: 'click', name: 'Click' })]
    const text = JSON.stringify({
      soundix: 2,
      ui: [{ id: 'buy', kind: 'button', text: 'Buy', sounds: { press: 'purchase' } }],
    })
    const back = parseSoundixJson(text, current)
    expect(back.ok && back.events.map((e) => e.file)).toEqual(['click', 'purchase'])
  })

  it('imports v1 files as events without a wireframe', () => {
    const back = parseSoundixJson('{"soundix":1,"events":[{"id":"click","name":"Click"}]}', [])
    expect(back.ok && [back.events[0].file, back.ui]).toEqual(['click', []])
  })

  it('binds an underscored event id to its imported sound', () => {
    const back = parseSoundixJson(
      JSON.stringify({
        soundix: 2,
        events: [{ id: '_click', source: { library: 'ui-audio/click1' } }],
        ui: [{ id: 'buy', kind: 'button', sounds: { press: '_click' } }],
      }),
      [],
    )
    if (!back.ok) throw new Error(back.error)
    const bound = back.events.find((e) => e.file === back.ui[0].sounds.press)
    expect(bound?.sound).toEqual({ kind: 'library', id: 'ui-audio/click1' })
  })

  it('keeps an explicitly on-screen element on screen after an export round trip', () => {
    const imported = parseSoundixJson(
      JSON.stringify({
        soundix: 2,
        events: [],
        ui: [
          { id: 'shop', kind: 'window', x: 0.2, y: 0.1, w: 0.6, h: 0.7 },
          {
            id: 'play',
            kind: 'button',
            text: 'Play',
            x: 0.3,
            y: 0.3,
            w: 0.15,
            h: 0.1,
            parent: null,
          },
        ],
      }),
      [],
    )
    if (!imported.ok) throw new Error(imported.error)
    const exported = buildSoundixJson(imported.events, [], imported.ui)
    const back = parseSoundixJson(JSON.stringify(exported), [])
    if (!back.ok) throw new Error(back.error)
    expect(back.ui.find((el) => el.id === 'play')?.parent).toBeUndefined()
  })

  it('names the reason a file is rejected', () => {
    const fails = (text: string) => {
      const result = parseSoundixJson(text, [])
      return result.ok ? 'ok' : result.error
    }
    expect(fails('{oops')).toBe('not-json')
    expect(fails('{"hello":1}')).toBe('not-soundix')
    expect(fails('{"soundix":3}')).toBe('bad-version')
    expect(fails('{"soundix":2,"events":[{"name":"x"}]}')).toBe('bad-events')
    expect(fails('{"soundix":2,"ui":[{"kind":"rocket"}]}')).toBe('bad-ui')
    const badOwn = { id: 'click', source: { own: true, original: { toString: null } } }
    expect(fails(JSON.stringify({ soundix: 2, events: [badOwn] }))).toBe('bad-events')
  })
})
