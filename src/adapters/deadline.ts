// One abort signal for both Cancel and a time limit on a whole chain of requests.
export function deadline(signal: AbortSignal, ms: number) {
  const controller = new AbortController()
  let expired = false
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => {
    expired = true
    controller.abort()
  }, ms)
  return {
    signal: controller.signal,
    expired: () => expired,
    done: () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
    },
  }
}
