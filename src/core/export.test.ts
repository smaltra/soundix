import { describe, expect, it } from 'vitest'
import { planExport, type ExportFile } from './export'
import { createElement } from './layout'
import { event, library, sampleEvents } from './test-fixtures'

const text = (files: ExportFile[], path: string) => {
  const file = files.find((f) => f.path === path)
  return file && 'text' in file ? file.text : ''
}
const paths = (files: ExportFile[]) => files.map((f) => f.path).sort()

describe('planExport', () => {
  it('lists the sound files, soundix.json, CREDITS.txt and AGENT.md', () => {
    expect(paths(planExport(sampleEvents(), [], library, 'original').files)).toEqual([
      'AGENT.md',
      'CREDITS.txt',
      'soundix.json',
      'sounds/click.wav',
      'sounds/my_jump.mp3',
      'sounds/win.ogg',
    ])
    expect(paths(planExport(sampleEvents(), [], library, 'ogg').files)).toContain(
      'sounds/click.ogg',
    )
  })

  it('credits generated sounds with their model and prompt', () => {
    const generated = {
      model: 'fal-ai/elevenlabs/sound-effects/v2',
      prompt: 'Click:\na short UI click',
    }
    const click = event({
      file: 'click',
      sound: { kind: 'own', id: 'own:1', name: 'click-ai.mp3', generated },
    })
    // A model name Soundix does not know is cut short.
    const odd = event({
      file: 'hit',
      sound: {
        kind: 'own',
        id: 'own:2',
        name: 'hit.mp3',
        generated: { model: 'x'.repeat(300), prompt: 'Hit' },
      },
    })
    const { files } = planExport([click, odd], [], library, 'original')
    const credits = text(files, 'CREDITS.txt')
    expect(credits).toContain('Generated with AI')
    expect(credits).toContain('sounds/click.mp3 — ElevenLabs SFX v2 — via fal.ai')
    expect(credits).toContain('Prompt: Click: a short UI click')
    expect(credits).toContain('Terms: https://fal.ai/models/fal-ai/elevenlabs/sound-effects/v2')
    expect(credits).not.toContain('x'.repeat(120))
    expect(JSON.parse(text(files, 'soundix.json')).events[0].source).toEqual({
      own: true,
      original: 'click-ai.mp3',
      generated,
    })
  })

  it('exports own sounds as they are, in either format', () => {
    const own = sampleEvents()[2]
    expect(paths(planExport([own], [], library, 'ogg').files)).toContain('sounds/my_jump.mp3')
    // A sound made mono is a WAV now, even if its old name still says mp3.
    const wav = planExport([own], [], library, 'original', () => 'audio/wav')
    expect(paths(wav.files)).toContain('sounds/my_jump.wav')
  })

  it('keeps silent events in soundix.json without a file', () => {
    const plan = planExport(sampleEvents(), [], library, 'original')
    expect(plan.skipped.map((e) => e.file)).toEqual(['silent'])
    const silent = JSON.parse(text(plan.files, 'soundix.json')).events[3]
    expect([silent.id, silent.file]).toEqual(['silent', null])
    expect(paths(plan.files).some((p) => p.includes('silent'))).toBe(false)
  })

  it('skips an own sound this browser no longer has instead of failing the archive', () => {
    const plan = planExport(sampleEvents(), [], library, 'original', () => null)
    expect(plan.skipped.map((e) => e.file)).toEqual(['my_jump', 'silent'])
    expect(paths(plan.files)).not.toContain('sounds/my_jump.mp3')
  })

  it('credits only the packs in the archive', () => {
    const credits = text(planExport(sampleEvents(), [], library, 'original').files, 'CREDITS.txt')
    expect(credits).toContain('UI Audio')
    expect(credits).toContain('512 Retro (8-bit)')
    expect(credits).not.toContain('Unused Pack')
    expect(credits.trim().endsWith('Made with Soundix — https://smaltra.github.io/soundix/')).toBe(
      true,
    )
  })

  it('tells the agent about every event and element', () => {
    const ui = [
      createElement('button', 'Buy', [], ['click']),
      createElement('window', 'Shop', [], []),
    ]
    const agent = text(planExport(sampleEvents(), ui, library, 'original').files, 'AGENT.md')
    for (const id of ['click', 'win', 'my_jump', 'silent', 'buy_button', 'shop_window']) {
      expect(agent).toContain(`\`${id}\``)
    }
  })
})
