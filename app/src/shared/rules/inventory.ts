// Inventory totals.

import type { CharacterFile } from '../schema/character'

export function totalWeight(character: CharacterFile): number {
  const sum = character.inventory.reduce((total, item) => total + item.quantity * item.weight, 0)
  return Math.round(sum * 100) / 100 // avoid 0.30000000000000004
}

export function attunedCount(character: CharacterFile): number {
  return character.inventory.filter((item) => item.attuned).length
}
