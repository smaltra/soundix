// Every played event flashes whatever shows it: its card, pad and mock labels.
import { useEffect, useRef } from 'react'

const bus = new EventTarget()

export const flash = (key: string) => bus.dispatchEvent(new CustomEvent('flash', { detail: key }))

/** Ref for an element that gets the `flash` class each time the event with `key` plays. */
export function useFlash<T extends HTMLElement>(key: string | undefined) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!key) return
    const onFlash = (e: Event) => {
      const el = ref.current
      if (!el || (e as CustomEvent<string>).detail !== key) return
      el.classList.remove('flash')
      void el.offsetWidth // restart the animation
      el.classList.add('flash')
    }
    bus.addEventListener('flash', onFlash)
    return () => bus.removeEventListener('flash', onFlash)
  }, [key])
  return ref
}
