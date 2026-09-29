import { expect, it } from 'vitest'
import { copyOf } from './variant-copy'

it('finds the copy of a variant from either side of the link', () => {
  const sounds = [{ id: 'own:a' }, { id: 'own:b', variant: 'v:2' }]
  expect(copyOf({ id: 'v:1', savedId: 'own:a' }, sounds)?.id).toBe('own:a')
  // The variant's side was refused: the copy still names it.
  expect(copyOf({ id: 'v:2' }, sounds)?.id).toBe('own:b')
  // A link to a deleted copy leads nowhere.
  expect(copyOf({ id: 'v:3', savedId: 'own:gone' }, sounds)).toBeUndefined()
})
