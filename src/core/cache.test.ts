import { describe, expect, it } from 'vitest'
import { sizedCache } from './cache'

describe('sized cache', () => {
  it('drops the least recently used values once the total size passes the limit', () => {
    const cache = sizedCache<number>(10, (v) => v)
    cache.set('a', 4)
    cache.set('b', 4)
    expect(cache.get('a')).toBe(4) // a is now the most recent
    cache.set('c', 4)
    expect(cache.get('b')).toBeUndefined()
    expect([cache.get('a'), cache.get('c'), cache.total()]).toEqual([4, 4, 8])
    cache.delete('a')
    expect([cache.get('a'), cache.total()]).toEqual([undefined, 4])
    // One value larger than the limit stays until the next one comes.
    cache.set('big', 20)
    expect([cache.get('c'), cache.get('big')]).toEqual([undefined, 20])
  })
})
