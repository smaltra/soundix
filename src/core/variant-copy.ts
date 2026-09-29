// A variant used for an event has one copy in My sounds. The link is kept on both sides, so a
// write refused on one side never makes a later Use store a second copy.

/** The copy of a variant in My sounds: the one the variant names, or the one naming it. */
export function copyOf<S extends { id: string; variant?: string }>(
  variant: { id: string; savedId?: string },
  sounds: S[],
): S | undefined {
  return (
    sounds.find((s) => s.id === variant.savedId) ?? sounds.find((s) => s.variant === variant.id)
  )
}
