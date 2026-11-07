// Spell save DC and spell attack bonus.

import { mod, proficiencyBonus } from './abilities'
import type { CharacterFile } from '../schema/character'
import { bonusFor } from './effects'

// null when the character has no spellcasting ability set.
export function spellSaveDC(character: CharacterFile): number | null {
  const ability = character.spellcasting.ability
  if (!ability) return null
  return 8 + proficiencyBonus(character) + mod(character, ability) + bonusFor('spellSaveDC', character)
}

export function spellAttackBonus(character: CharacterFile): number | null {
  const ability = character.spellcasting.ability
  if (!ability) return null
  return proficiencyBonus(character) + mod(character, ability) + bonusFor('spellAttack', character)
}
