// The shape of a character JSON file. This file is the source of truth for
// the format; docs/milestone-0-design.md describes the reasoning.
//
// Rule of thumb: the file stores what the player chose and what has happened
// in play. Anything that can be worked out (modifiers, save DC, passive
// Perception) is calculated by the functions in src/shared/rules.

import type { Activation, Duration, Modifier, RestType, Trigger } from './effects'

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
export type ProficiencyLevel = 'none' | 'proficient' | 'expertise'

export const CURRENT_SCHEMA_VERSION = 1

export interface CharacterFile {
  schemaVersion: number
  id: string
  name: string
  player: string
  portrait: string | null // small embedded image (data URL)

  // Links to imported rules data. Empty until the data pack exists (Milestone 2+).
  speciesId: string | null
  backgroundId: string | null
  levels: LevelRecord[]

  // Hand-entered labels shown on the sheet until the links above are filled.
  speciesName: string
  backgroundName: string

  abilityScores: Record<Ability, number>
  manualValues: ManualValues
  proficiencies: Proficiencies

  attacks: Attack[]
  spellcasting: Spellcasting
  spells: SpellEntry[]
  inventory: InventoryItem[]
  coins: Coins

  defenses: { resistances: string[]; immunities: string[]; vulnerabilities: string[] }
  senses: string[]

  // Features, traits, homebrew, curses. Anything with `uses` shows as a
  // resource counter in the right column.
  customEffects: CustomEffect[]

  state: PlayState
  dmOverrides: {
    featureLevels: Record<string, number>
    replacedEntries: Record<string, string>
    modifiers: Modifier[]
  }
  notes: Record<string, string>
}

// Any number set here is used instead of the calculated value. In Milestone 1
// everything is entered here by hand.
export interface ManualValues {
  classes: ManualClass[]
  maxHp: number | null
  proficiencyBonus: number | null
  armorClass: number | null
  speed: number | null
  initiativeBonus: number // extra on top of Dex
}

export interface ManualClass {
  name: string
  subclass: string
  level: number
  hitDie: number // 6, 8, 10 or 12
}

// One record per level taken, in order. Filled by the level-up wizard (Milestone 3).
export interface LevelRecord {
  classId: string
  classLevel: number
  hp: { method: 'max' | 'average' | 'rolled' | 'manual'; value: number }
  choices: Record<string, string[]>
}

export interface Proficiencies {
  savingThrows: Ability[]
  skills: Record<string, ProficiencyLevel> // skill id -> level; missing means none
  armor: string[]
  weapons: string[]
  tools: string[]
  languages: string[]
}

export interface Attack {
  id: string
  name: string
  ability: Ability
  proficient: boolean
  attackBonusExtra: number // magic weapon bonus and the like
  damage: string // dice, e.g. "1d12"
  damageType: string
  addAbilityToDamage: boolean
  damageBonusExtra: number
  mastery: string // weapon mastery property name, as written by the player for now
  range: string
  notes: string
}

export interface Spellcasting {
  ability: Ability | null
  slotsMax: number[] // index 0 = level 1 slots ... index 8 = level 9
}

export interface SpellEntry {
  id: string
  spellId: string | null // link to imported spell, later
  name: string
  level: number // 0 = cantrip
  prepared: boolean
  notes: string
}

export interface InventoryItem {
  id: string
  itemId: string | null // link to imported item, later
  name: string
  quantity: number
  weight: number // per item, in pounds
  equipped: boolean
  attuned: boolean
  notes: string
}

export interface Coins {
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
}

export interface CustomEffect {
  id: string
  name: string
  kind: 'feature' | 'trait' | 'condition' | 'curse' | 'boon'
  source: string // where it comes from, e.g. "Barbarian 1" or "DM"
  description: string
  activation: Activation
  active: boolean
  uses: { max: number; used: number; resetOn: RestType | 'none' } | null
  modifiers: Modifier[]
  triggers: Trigger[]
  duration: Duration
}

export interface PlayState {
  hpCurrent: number
  tempHp: number
  tempHpExpires: Duration | null
  hitDiceUsed: Record<string, number> // "d12" -> dice spent
  deathSaves: { successes: number; failures: number }
  inspiration: boolean
  exhaustion: number
  conditions: string[]
  spellSlotsUsed: number[] // same indexing as slotsMax
  toggles: Record<string, boolean>
}
