// Damage, healing and temporary hit points.
// These functions change the character passed in. The UI always passes a copy,
// so the original is never changed by accident.

import type { CharacterFile } from '../schema/character'

// Temporary HP soaks damage first; the rest comes off current HP, which stops at 0.
export function applyDamage(character: CharacterFile, amount: number): void {
  if (amount <= 0) return
  const state = character.state
  const fromTemp = Math.min(state.tempHp, amount)
  state.tempHp -= fromTemp
  if (state.tempHp === 0) state.tempHpExpires = null
  state.hpCurrent = Math.max(0, state.hpCurrent - (amount - fromTemp))
}

// Healing can't go above max HP. Getting up from 0 clears death saves.
export function applyHealing(character: CharacterFile, amount: number, maxHp: number): void {
  if (amount <= 0) return
  const state = character.state
  if (state.hpCurrent === 0) state.deathSaves = { successes: 0, failures: 0 }
  state.hpCurrent = Math.min(maxHp, state.hpCurrent + amount)
}

// Temporary HP don't add together: you keep whichever is higher.
export function gainTempHp(character: CharacterFile, amount: number): void {
  if (amount > character.state.tempHp) {
    character.state.tempHp = amount
    character.state.tempHpExpires = null
  }
}
