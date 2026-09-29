// Keys of fal.ai and ElevenLabs, stored only when the person asks. Every page on
// smaltra.github.io shares this localStorage, so by default a key lives in memory only.
import type { Provider } from '../core/generate'

const storageKey = (provider: Provider) => `soundix:${provider}-key`

export function loadApiKey(provider: Provider): string {
  try {
    return localStorage.getItem(storageKey(provider)) ?? ''
  } catch {
    return ''
  }
}

export function saveApiKey(provider: Provider, key: string) {
  try {
    localStorage.setItem(storageKey(provider), key)
  } catch {
    // Not remembered; it still works for this tab.
  }
}

export function forgetApiKey(provider: Provider) {
  try {
    localStorage.removeItem(storageKey(provider))
  } catch {
    // Nothing stored.
  }
}
