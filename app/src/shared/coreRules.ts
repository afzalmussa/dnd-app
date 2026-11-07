// Typed access to coreRules.json, so the rest of the code gets autocomplete
// and type checking on ability and skill IDs.
import data from './coreRules.json'
import type { Ability } from './schema/character'

export interface AbilityInfo {
  id: Ability
  name: string
}

export interface SkillInfo {
  id: string
  name: string
  ability: Ability
}

export const ABILITIES = data.abilities as AbilityInfo[]
export const SKILLS = data.skills as SkillInfo[]

export const CLASS_NAMES: string[] = data.classes
export const DAMAGE_TYPES: string[] = data.damageTypes
export const CONDITIONS: string[] = data.conditions
export const ARMOR_TRAINING: string[] = data.armorTraining
export const WEAPON_CATEGORIES: string[] = data.weaponCategories
export const TOOLS: string[] = data.tools
export const LANGUAGES: string[] = data.languages
