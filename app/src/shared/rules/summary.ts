// Headline numbers for the top bar and right column.

import { mod } from './abilities'
import type { CharacterFile } from '../schema/character'

export function totalLevel(character: CharacterFile): number {
  return character.manualValues.classes.reduce((sum, c) => sum + c.level, 0)
}

// "Barbarian 6 (Path of the Berserker)" or "Fighter 3 / Rogue 2" for multiclass.
export function classLabel(character: CharacterFile): string {
  const parts = character.manualValues.classes
    .filter((c) => c.name.trim() !== '')
    .map((c) => `${c.name} ${c.level}${c.subclass ? ` (${c.subclass})` : ''}`)
  return parts.length > 0 ? parts.join(' / ') : 'No class set'
}

export interface HitDicePool {
  die: number // 12 for d12
  total: number
  used: number
}

// Multiclass characters have one pool per die size: a Barbarian 3 / Fighter 2
// has 3d12 and 2d10.
export function hitDicePools(character: CharacterFile): HitDicePool[] {
  const totals = new Map<number, number>()
  for (const c of character.manualValues.classes) {
    totals.set(c.hitDie, (totals.get(c.hitDie) ?? 0) + c.level)
  }
  return [...totals.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([die, total]) => ({ die, total, used: character.state.hitDiceUsed[`d${die}`] ?? 0 }))
}

export function maxHp(character: CharacterFile): number {
  return character.manualValues.maxHp ?? 0
}

// Hand-entered in Milestone 1. When not set, falls back to 10 + Dex (no armor);
// armor from the inventory is calculated once item data exists.
export function armorClass(character: CharacterFile): number {
  return character.manualValues.armorClass ?? 10 + mod(character, 'dex')
}
