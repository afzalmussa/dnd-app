// What the DM sees about one character at a glance: HP, AC, passive Perception, spell slots, resources.
// Read-only: nothing here changes a character.

import type { CharacterFile } from '../schema/character'
import { passivePerception, initiativeBonus } from './abilities'
import { isActive, resourceMax } from './effects'
import { effectiveSpeed } from './exhaustion'
import { armorClass, classLabel, maxHp, totalLevel, walkSpeed } from './summary'

export interface PartyMember {
  fileName: string
  readable: boolean
  error?: string
  name: string
  player: string
  classLabel: string
  level: number
  hp: { current: number; max: number; temp: number }
  armorClass: number
  passivePerception: number
  initiative: number
  speed: number | null
  slots: { level: number; left: number; max: number }[]
  resources: { name: string; left: number; max: number }[]
  conditions: string[]
  exhaustion: number
  inspiration: boolean
  activeEffects: string[]
}

export function partyMember(fileName: string, c: CharacterFile): PartyMember {
  const slots = c.spellcasting.slotsMax
    .map((max, i) => ({ level: i + 1, max, left: Math.max(0, max - (c.state.spellSlotsUsed[i] ?? 0)) }))
    .filter((s) => s.max > 0)
  const resources = c.customEffects
    .filter((e) => e.uses && isActive(e, c))
    .map((e) => {
      const max = resourceMax(c, e)
      return { name: e.name, max, left: Math.max(0, max - e.uses!.used) }
    })
  return {
    fileName,
    readable: true,
    name: c.name,
    player: c.player,
    classLabel: classLabel(c),
    level: totalLevel(c),
    hp: { current: c.state.hpCurrent, max: maxHp(c), temp: c.state.tempHp },
    armorClass: armorClass(c),
    passivePerception: passivePerception(c),
    initiative: initiativeBonus(c),
    speed: effectiveSpeed(walkSpeed(c), c.state.exhaustion),
    slots,
    resources,
    conditions: c.state.conditions,
    exhaustion: c.state.exhaustion,
    inspiration: c.state.inspiration,
    activeEffects: c.customEffects.filter((e) => e.kind !== 'feature' && e.kind !== 'trait' && isActive(e, c)).map((e) => e.name)
  }
}

export function unreadableMember(fileName: string, error: string): PartyMember {
  return {
    fileName, readable: false, error, name: fileName, player: '', classLabel: '', level: 0,
    hp: { current: 0, max: 0, temp: 0 }, armorClass: 0, passivePerception: 0, initiative: 0, speed: null,
    slots: [], resources: [], conditions: [], exhaustion: 0, inspiration: false, activeEffects: []
  }
}
