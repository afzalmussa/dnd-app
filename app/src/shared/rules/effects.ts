// Applies the modifiers, timed effects and triggers on a character's custom features
// (class features, feats, homebrew features, curses, conditions) to the sheet's numbers.
//
// A modifier has a target such as "ac", "save.dex" or "resource.<effectId>.max", an operation
// (add, set, cap, atLeast), a value, and an optional toggle name in `when` (e.g. "raging"):
// it only applies while that toggle is on.
// Order for one target: set (last one wins), then add, then atLeast, then cap.
//
// This file imports only types, so the other rules files can use it without a cycle.

import type { Ability, CharacterFile, CustomEffect } from '../schema/character'
import type { Modifier, Trigger } from '../schema/effects'

export interface ActiveModifier extends Modifier {
  effectId: string
  effectName: string
}

// "Day 12, 21:30" from minutes since the campaign started.
export function formatGameTime(minutes: number): string {
  const day = Math.floor(minutes / 1440) + 1
  const hh = String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  return `Day ${day}, ${hh}:${mm}`
}

export function gameMinutes(character: CharacterFile): number {
  return character.state.gameMinutes ?? 0
}

// An effect ends when its in-game time has passed, or when its rounds run out.
export function isExpired(effect: CustomEffect, nowMinutes: number): boolean {
  if (effect.duration.type === 'untilTime') return nowMinutes >= effect.duration.at
  if (effect.duration.type === 'rounds') return effect.duration.remaining <= 0
  return false
}

export function isActive(effect: CustomEffect, character: CharacterFile): boolean {
  return effect.active && !isExpired(effect, gameMinutes(character))
}

export function activeModifiers(character: CharacterFile): ActiveModifier[] {
  const out: ActiveModifier[] = []
  for (const effect of character.customEffects) {
    if (!isActive(effect, character)) continue
    for (const m of effect.modifiers) {
      if (m.when && !character.state.toggles[m.when]) continue
      out.push({ ...m, effectId: effect.id, effectName: effect.name })
    }
  }
  return out
}

export function modifyNumber(base: number, target: string, character: CharacterFile): number {
  const mods = activeModifiers(character).filter((m) => m.target === target && typeof m.value === 'number')
  let value = base
  for (const m of mods.filter((x) => x.op === 'set')) value = m.value as number
  for (const m of mods.filter((x) => x.op === 'add')) value += m.value as number
  for (const m of mods.filter((x) => x.op === 'atLeast')) value = Math.max(value, m.value as number)
  for (const m of mods.filter((x) => x.op === 'cap')) value = Math.min(value, m.value as number)
  return value
}

// The extra bonus modifiers add to a roll or stat (base 0), e.g. a +1 to Dex saves.
export function bonusFor(target: string, character: CharacterFile): number {
  return modifyNumber(0, target, character)
}

export function effectiveAbilityScore(character: CharacterFile, ability: Ability): number {
  return modifyNumber(character.abilityScores[ability], `ability.${ability}`, character)
}

// Text modifiers such as resistance, vulnerability, immunity and senses add to the lists on the sheet.
export function textValuesFor(target: string, character: CharacterFile): string[] {
  return activeModifiers(character)
    .filter((m) => m.target === target && m.op === 'add' && typeof m.value === 'string')
    .map((m) => m.value as string)
}

export function resourceMax(character: CharacterFile, effect: CustomEffect): number {
  return effect.uses ? Math.max(0, modifyNumber(effect.uses.max, `resource.${effect.id}.max`, character)) : 0
}

export function effectiveDefenses(character: CharacterFile) {
  const merge = (base: string[], extra: string[]) => [...new Set([...base, ...extra])]
  return {
    resistances: merge(character.defenses.resistances, textValuesFor('resistance', character)),
    immunities: merge(character.defenses.immunities, textValuesFor('immunity', character)),
    vulnerabilities: merge(character.defenses.vulnerabilities, textValuesFor('vulnerability', character))
  }
}

export function effectiveSenses(character: CharacterFile): string[] {
  const extra = activeModifiers(character)
    .filter((m) => m.target.startsWith('sense.') && typeof m.value === 'number')
    .map((m) => `${m.target.slice(6).replace(/^./, (c) => c.toUpperCase())} ${m.value} ft`)
  return [...new Set([...character.senses, ...extra])]
}

// A feature that turns healing into damage (e.g. a vampire curse). Returns the first matching trigger.
export function healTrigger(character: CharacterFile): { effect: CustomEffect; trigger: Extract<Trigger, { on: 'heal' }> } | null {
  for (const effect of character.customEffects) {
    if (!isActive(effect, character)) continue
    const trigger = effect.triggers.find((t) => t.on === 'heal')
    if (trigger) return { effect, trigger }
  }
  return null
}

// Turns effects off when their time has run out and drops temporary HP that expired.
// Returns what ended, so the UI can say so.
export function expireEffects(character: CharacterFile): string[] {
  const ended: string[] = []
  const now = gameMinutes(character)
  for (const effect of character.customEffects) {
    if (effect.active && isExpired(effect, now)) {
      effect.active = false
      ended.push(effect.name)
    }
  }
  const exp = character.state.tempHpExpires
  if (exp && ((exp.type === 'untilTime' && now >= exp.at) || (exp.type === 'rounds' && exp.remaining <= 0))) {
    character.state.tempHp = 0
    character.state.tempHpExpires = null
    ended.push('Temporary hit points')
  }
  return ended
}

// Moves the in-game clock forward and ends whatever has run out.
export function advanceTime(character: CharacterFile, minutes: number): string[] {
  character.state.gameMinutes = gameMinutes(character) + minutes
  return expireEffects(character)
}

// One combat round passes: effects and temporary HP measured in rounds tick down.
export function nextRound(character: CharacterFile): string[] {
  for (const effect of character.customEffects) {
    if (effect.duration.type === 'rounds' && effect.active) effect.duration = { type: 'rounds', remaining: effect.duration.remaining - 1 }
  }
  const exp = character.state.tempHpExpires
  if (exp?.type === 'rounds') character.state.tempHpExpires = { type: 'rounds', remaining: exp.remaining - 1 }
  return expireEffects(character)
}

// Names of the toggles that modifiers refer to, so the sheet can show an on/off switch for each.
export function toggleNames(character: CharacterFile): string[] {
  return [...new Set(character.customEffects.flatMap((e) => e.modifiers.map((m) => m.when).filter((w): w is string => !!w)))]
}

export const MODIFIER_TARGETS: { value: string; label: string; text?: boolean }[] = [
  { value: 'ac', label: 'Armor Class' },
  { value: 'hp.max', label: 'Hit point maximum' },
  { value: 'speed.walk', label: 'Walking speed' },
  { value: 'initiative', label: 'Initiative' },
  { value: 'spellSaveDC', label: 'Spell save DC' },
  { value: 'spellAttack', label: 'Spell attack bonus' },
  ...(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).flatMap((a) => [
    { value: `ability.${a}`, label: `${a.toUpperCase()} score` },
    { value: `save.${a}`, label: `${a.toUpperCase()} saving throw` }
  ]),
  { value: 'resistance', label: 'Resistance (damage type)', text: true },
  { value: 'vulnerability', label: 'Vulnerability (damage type)', text: true },
  { value: 'immunity', label: 'Immunity (damage type or condition)', text: true },
  { value: 'sense.darkvision', label: 'Darkvision range (ft)' }
]
