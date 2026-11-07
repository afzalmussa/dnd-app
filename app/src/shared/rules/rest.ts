// Short and long rests.
// These functions change the character passed in (the UI passes a copy).
//
// Assumptions to check against the 2024 PHB Rules Glossary (Short Rest, Long
// Rest, Temporary Hit Points). Each one is a single line below if it needs changing:
//   - Spending a Hit Point Die heals the roll + Con modifier, never less than 0.
//   - A long rest restores all HP and all spent Hit Point Dice.
//   - A long rest removes temporary HP and reduces Exhaustion by 1.

import { mod } from './abilities'
import { hitDicePools } from './summary'
import type { CharacterFile } from '../schema/character'
import type { RestType } from '../schema/effects'

// Returns the HP regained, or null if no dice of that size are left.
export function spendHitDie(character: CharacterFile, die: number, roll: number, maxHp: number): number | null {
  const pool = hitDicePools(character).find((p) => p.die === die)
  if (!pool || pool.used >= pool.total) return null
  const key = `d${die}`
  character.state.hitDiceUsed[key] = (character.state.hitDiceUsed[key] ?? 0) + 1
  const regained = Math.max(0, roll + mod(character, 'con'))
  const before = character.state.hpCurrent
  character.state.hpCurrent = Math.min(maxHp, before + regained)
  return character.state.hpCurrent - before
}

// Resets use counters and ends effects that last "until the next rest".
// A long rest also counts as a short rest for this purpose.
function resetForRest(character: CharacterFile, rest: RestType): void {
  for (const effect of character.customEffects) {
    if (effect.uses && (effect.uses.resetOn === 'short' || (rest === 'long' && effect.uses.resetOn === 'long'))) {
      effect.uses.used = 0
    }
    if (effect.duration.type === 'untilRest' && (effect.duration.rest === 'short' || rest === 'long')) {
      effect.active = false
    }
  }
}

export function shortRest(character: CharacterFile): void {
  resetForRest(character, 'short')
}

export function longRest(character: CharacterFile, maxHp: number): void {
  const state = character.state
  resetForRest(character, 'long')
  state.hpCurrent = maxHp
  state.tempHp = 0
  state.tempHpExpires = null
  state.hitDiceUsed = {}
  state.spellSlotsUsed = state.spellSlotsUsed.map(() => 0)
  state.deathSaves = { successes: 0, failures: 0 }
  state.exhaustion = Math.max(0, state.exhaustion - 1)
}
