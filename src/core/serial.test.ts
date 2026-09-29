import { describe, expect, it } from 'vitest'
import { serialRecords, sharedRuns } from './serial'

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('serial records', () => {
  it('runs the changes of one record one at a time, in order, even after a failure', async () => {
    const records = serialRecords()
    const log: string[] = []
    const change =
      (name: string, ms: number, fail = false) =>
      async () => {
        log.push(`${name} start`)
        await pause(ms)
        log.push(`${name} end`)
        if (fail) throw new Error(name)
        return name
      }
    const first = records.run('a', change('a1', 10, true))
    const second = records.run('a', change('a2', 1))
    const other = records.run('b', change('b1', 1))
    await expect(first).rejects.toThrow('a1')
    expect(await second).toBe('a2')
    expect(await other).toBe('b1')
    // a2 waited for a1; b1 did not wait for either.
    expect(log.indexOf('a2 start')).toBeGreaterThan(log.indexOf('a1 end'))
    expect(log.indexOf('b1 start')).toBeLessThan(log.indexOf('a1 end'))
  })

  it('marks a deleted record at once, so a change already waiting sees it', async () => {
    const records = serialRecords()
    const slow = records.run('a', () => pause(10))
    const late = records.run('a', async () => (records.isBuried('a') ? 'refused' : 'written'))
    records.bury('a')
    expect(records.isBuried('a')).toBe(true)
    await slow
    expect(await late).toBe('refused')
  })
})

describe('shared runs', () => {
  it('shares one run per id while it is on its way, then starts a new one', async () => {
    const runs = sharedRuns<string>()
    let made = 0
    const make = async () => {
      made++
      await pause(5)
      return `copy ${made}`
    }
    const [a, b] = await Promise.all([runs.run('v', make), runs.run('v', make)])
    expect([a, b, made]).toEqual(['copy 1', 'copy 1', 1])
    expect(await runs.run('v', make)).toBe('copy 2')
  })
})
