import { useRef } from 'react'
import { newStep } from './state'

/**
 * One undo step per gesture. Spread `field` on a text field (a step lasts from focus to leaving
 * it) or `gesture` on a slider (each press of the pointer starts a step), and pass `step()` with
 * each edit.
 */
export function useStep() {
  const step = useRef(0)
  const renew = () => {
    step.current = newStep()
  }
  return {
    step: () => step.current || (step.current = newStep()),
    field: { onFocus: renew },
    gesture: { onFocus: renew, onPointerDown: renew },
  }
}
