/** Values by key; once their total size passes `max`, the least recently used go first. */
export function sizedCache<T>(max: number, sizeOf: (value: T) => number) {
  // A Map keeps insertion order: the first entry is the least recently used.
  const entries = new Map<string, { value: T; size: number }>()
  let total = 0

  const remove = (key: string) => {
    const entry = entries.get(key)
    if (!entry) return
    total -= entry.size
    entries.delete(key)
  }

  return {
    get(key: string): T | undefined {
      const entry = entries.get(key)
      if (!entry) return undefined
      entries.delete(key)
      entries.set(key, entry)
      return entry.value
    },
    set(key: string, value: T) {
      remove(key)
      const size = sizeOf(value)
      entries.set(key, { value, size })
      total += size
      for (const old of entries.keys()) {
        if (total <= max || old === key) break
        remove(old)
      }
    },
    delete: remove,
    total: () => total,
  }
}
