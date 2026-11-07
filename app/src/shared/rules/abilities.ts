// Ability modifiers, saves, skills and the numbers built from them.

import { SKILLS } from '../coreRules'
import type { Ability, CharacterFile } from '../schema/character'
import { bonusFor, effectiveAbilityScore } from './effects'

// Score 10-11 gives +0, 12-13 gives +1, 8-9 gives -1, and so on.
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function mod(character: CharacterFile, ability: Ability): number {
  return abilityModifier(effectiveAbilityScore(character, ability))
}

// Shows a bonus the way the books print it: +3, +0, -1.
export function formatBonus(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
}

// Milestone 1: entered by hand. From Milestone 3 this comes from the imported
// class table. Returns 0 when not set, and the sheet shows a warning.
export function proficiencyBonus(character: CharacterFile): number {
  return character.manualValues.proficiencyBonus ?? 0
}

export function isSaveProficient(character: CharacterFile, ability: Ability): boolean {
  return character.proficiencies.savingThrows.includes(ability)
}

export function saveBonus(character: CharacterFile, ability: Ability): number {
  const proficiency = isSaveProficient(character, ability) ? proficiencyBonus(character) : 0
  return mod(character, ability) + proficiency + bonusFor(`save.${ability}`, character)
}

export function skillProficiency(character: CharacterFile, skillId: string) {
  return character.proficiencies.skills[skillId] ?? 'none'
}

export function skillBonus(character: CharacterFile, skillId: string): number {
  const skill = SKILLS.find((s) => s.id === skillId)
  if (!skill) throw new Error(`Unknown skill: ${skillId}`)
  const level = skillProficiency(character, skillId)
  const pb = proficiencyBonus(character)
  const proficiency = level === 'expertise' ? pb * 2 : level === 'proficient' ? pb : 0
  return mod(character, skill.ability) + proficiency + bonusFor(`skill.${skillId}`, character)
}

export function passivePerception(character: CharacterFile): number {
  return 10 + skillBonus(character, 'perception')
}

export function initiativeBonus(character: CharacterFile): number {
  return mod(character, 'dex') + character.manualValues.initiativeBonus + bonusFor('initiative', character)
}
