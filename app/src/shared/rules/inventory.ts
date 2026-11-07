// Inventory totals.

import type { CharacterFile } from '../schema/character'
import { carryingCapacity, dragLiftPushCapacity } from './carrying'

export function totalWeight(character: CharacterFile): number {
  const sum = character.inventory.reduce((total, item) => total + item.quantity * item.weight, 0)
  return Math.round(sum * 100) / 100 // avoid 0.30000000000000004
}

// Carrying capacity from the Strength score (2024 PHB glossary, see carrying.ts).
export function capacity(character: CharacterFile): { carry: number; dragLiftPush: number } {
  const strength = character.abilityScores.str
  return { carry: carryingCapacity(strength), dragLiftPush: dragLiftPushCapacity(strength) }
}

export function isOverCapacity(character: CharacterFile): boolean {
  return totalWeight(character) > capacity(character).carry
}

export function attunedCount(character: CharacterFile): number {
  return character.inventory.filter((item) => item.attuned).length
}
