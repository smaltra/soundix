// Stored records changed from several places at once (a Use, Make all mono, a delete): every
// change to one record waits for the one before it, and a delete is known at once.

export function serialRecords() {
  const tails = new Map<string, Promise<unknown>>()
  const buried = new Set<string>()

  /** Runs a change to one record after the changes queued before it, whatever they returned. */
  const run = <T>(id: string, change: () => Promise<T>): Promise<T> => {
    const before = tails.get(id) ?? Promise.resolve()
    const result = before.then(change, change)
    const tail = result.catch(() => undefined)
    tails.set(id, tail)
    void tail.then(() => {
      if (tails.get(id) === tail) tails.delete(id)
    })
    return result
  }

  return {
    run,
    /** Marks a record deleted before storage answers: no later change may bring it back. */
    bury: (id: string) => {
      buried.add(id)
    },
    isBuried: (id: string) => buried.has(id),
  }
}

export interface SharedRuns<T> {
  /** Starts `make` unless a run for this id is on its way; then its result is shared. */
  run: (id: string, make: () => Promise<T>) => Promise<T>
}

/** One run per id at a time, e.g. one copy per variant: whoever asks meanwhile waits for it. */
export function sharedRuns<T>(): SharedRuns<T> {
  const running = new Map<string, Promise<T>>()
  return {
    run: (id, make) => {
      const current = running.get(id)
      if (current) return current
      const next = make()
      running.set(id, next)
      const done = () => {
        if (running.get(id) === next) running.delete(id)
      }
      next.then(done, done)
      return next
    },
  }
}
