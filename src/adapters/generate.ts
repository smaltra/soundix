// One entry for generation: the model's service decides where the request goes.
import type { GenModel, GenResult, GenStatus } from '../core/generate'
import { generateElevenLabs } from './elevenlabs'
import { generateOnFal } from './fal'

// Nothing from a response body reaches the result: errors are our categories and diagnosis.
export const generate = (
  model: GenModel,
  input: object,
  key: string,
  signal: AbortSignal,
  onStatus?: (status: GenStatus) => void,
): Promise<GenResult> =>
  model.provider === 'elevenlabs'
    ? generateElevenLabs(input, key, signal, onStatus)
    : generateOnFal(model.id, input, key, signal, onStatus)
