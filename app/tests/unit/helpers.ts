// Builds a test character from a blank one. The numbers in these tests are
// invented to exercise the maths; they are not taken from any book.
import { createBlankCharacter } from '../../src/shared/character'
import type { CharacterFile } from '../../src/shared/schema/character'

export function makeCharacter(change?: (c: CharacterFile) => void): CharacterFile {
  const character = createBlankCharacter()
  change?.(character)
  return character
}

// Returns the given numbers in order, as if Math.random had produced them.
export function fixedRandom(...values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

// The random value that makes rollDie(sides) return `face`.
export function face(value: number, sides: number): number {
  return (value - 1) / sides
}
