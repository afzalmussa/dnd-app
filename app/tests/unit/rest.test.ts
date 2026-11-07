import { describe, expect, it } from 'vitest'
import { longRest, shortRest, spendHitDie } from '../../src/shared/rules/rest'
import type { CustomEffect } from '../../src/shared/schema/character'
import { makeCharacter } from './helpers'

function effect(name: string, resetOn: 'short' | 'long' | 'none', used: number): CustomEffect {
  return {
    id: name,
    name,
    kind: 'feature',
    source: 'test',
    description: '',
    activation: 'bonus',
    active: true,
    uses: { max: 3, used, resetOn },
    modifiers: [],
    triggers: [],
    duration: { type: 'permanent' }
  }
}

function restingCharacter() {
  return makeCharacter((c) => {
    c.abilityScores.con = 14 // +2
    c.manualValues.classes = [
      { name: 'Test Class A', subclass: '', level: 3, hitDie: 12 },
      { name: 'Test Class B', subclass: '', level: 2, hitDie: 10 }
    ]
    c.state.hpCurrent = 10
    c.state.tempHp = 4
    c.state.exhaustion = 2
    c.state.hitDiceUsed = { d12: 2 }
    c.state.spellSlotsUsed = [2, 1, 0, 0, 0, 0, 0, 0, 0]
    c.customEffects = [effect('short one', 'short', 2), effect('long one', 'long', 3), effect('never', 'none', 1)]
  })
}

describe('spendHitDie', () => {
  it('heals the roll plus Con modifier and marks the die used', () => {
    const c = restingCharacter()
    expect(spendHitDie(c, 12, 7, 40)).toBe(9)
    expect(c.state.hpCurrent).toBe(19)
    expect(c.state.hitDiceUsed.d12).toBe(3)
  })

  it('refuses when that pool is empty', () => {
    const c = restingCharacter()
    c.state.hitDiceUsed = { d12: 3 }
    expect(spendHitDie(c, 12, 5, 40)).toBeNull()
  })

  it('refuses a die size the character does not have', () => {
    expect(spendHitDie(restingCharacter(), 8, 5, 40)).toBeNull()
  })

  it('does not heal above max HP', () => {
    const c = restingCharacter()
    expect(spendHitDie(c, 10, 10, 15)).toBe(5)
    expect(c.state.hpCurrent).toBe(15)
  })
})

describe('shortRest', () => {
  it('resets only short-rest counters', () => {
    const c = restingCharacter()
    shortRest(c)
    expect(c.customEffects.map((e) => e.uses?.used)).toEqual([0, 3, 1])
    expect(c.state.hpCurrent).toBe(10)
  })

  it('ends effects that last until a short rest', () => {
    const c = restingCharacter()
    c.customEffects[0].duration = { type: 'untilRest', rest: 'short' }
    c.customEffects[1].duration = { type: 'untilRest', rest: 'long' }
    shortRest(c)
    expect(c.customEffects[0].active).toBe(false)
    expect(c.customEffects[1].active).toBe(true)
  })
})

describe('longRest', () => {
  it('restores HP, hit dice and slots, and resets short and long counters', () => {
    const c = restingCharacter()
    longRest(c, 40)
    expect(c.state.hpCurrent).toBe(40)
    expect(c.state.tempHp).toBe(0)
    expect(c.state.hitDiceUsed).toEqual({})
    expect(c.state.spellSlotsUsed.every((n) => n === 0)).toBe(true)
    expect(c.state.exhaustion).toBe(1)
    expect(c.customEffects.map((e) => e.uses?.used)).toEqual([0, 0, 1])
  })

  it('does not take exhaustion below 0', () => {
    const c = restingCharacter()
    c.state.exhaustion = 0
    longRest(c, 40)
    expect(c.state.exhaustion).toBe(0)
  })
})
