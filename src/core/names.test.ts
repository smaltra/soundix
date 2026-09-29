import { describe, expect, it } from 'vitest'
import { toFileName, uniqueFileName } from './names'

describe('toFileName', () => {
  it('transliterates Cyrillic', () => {
    expect(toFileName('Прыжок')).toBe('pryzhok')
    expect(toFileName('Открытие окна')).toBe('otkrytie_okna')
    expect(toFileName('Щёлк')).toBe('shchelk')
  })

  it('keeps only a-z, 0-9 and single underscores', () => {
    expect(toFileName('  Level Up! 2 ')).toBe('level_up_2')
    expect(toFileName('Café—menu')).toBe('cafe_menu')
  })

  it('falls back when nothing is left', () => {
    expect(toFileName('★★★')).toBe('sound')
  })
})

describe('uniqueFileName', () => {
  it('adds the first free number', () => {
    expect(uniqueFileName('click', [])).toBe('click')
    expect(uniqueFileName('click', ['click', 'click_2'])).toBe('click_3')
  })
})
