// Weapon attack and damage numbers.

import { mod, proficiencyBonus } from './abilities'
import type { Attack, CharacterFile } from '../schema/character'

export function attackBonus(character: CharacterFile, attack: Attack): number {
  const proficiency = attack.proficient ? proficiencyBonus(character) : 0
  return mod(character, attack.ability) + proficiency + attack.attackBonusExtra
}

// The flat number added to the damage dice.
export function damageBonus(character: CharacterFile, attack: Attack): number {
  const abilityPart = attack.addAbilityToDamage ? mod(character, attack.ability) : 0
  return abilityPart + attack.damageBonusExtra
}

// "1d12+3", or just "1d12" when the bonus is 0.
export function damageExpression(character: CharacterFile, attack: Attack): string {
  const bonus = damageBonus(character, attack)
  if (bonus === 0) return attack.damage
  return `${attack.damage}${bonus > 0 ? '+' : ''}${bonus}`
}
