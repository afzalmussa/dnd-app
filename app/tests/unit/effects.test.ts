import { describe, expect, it } from 'vitest'
import { saveBonus, mod } from '../../src/shared/rules/abilities'
import {
  advanceTime, effectiveDefenses, expireEffects, formatGameTime, healTrigger, modifyNumber, nextRound, resourceMax, toggleNames
} from '../../src/shared/rules/effects'
import { armorClass, maxHp, walkSpeed } from '../../src/shared/rules/summary'
import type { CustomEffect } from '../../src/shared/schema/character'
import type { Modifier } from '../../src/shared/schema/effects'
import { makeCharacter } from './helpers'

function effect(id: string, modifiers: Modifier[], extra: Partial<CustomEffect> = {}): CustomEffect {
  return {
    id, name: id, kind: 'curse', source: 'test', description: '', activation: 'passive', active: true, uses: null,
    modifiers, triggers: [], duration: { type: 'permanent' }, ...extra
  }
}

describe('modifiers', () => {
  it('applies set, then add, then atLeast, then cap', () => {
    const c = makeCharacter((ch) => {
      ch.customEffects = [
        effect('a', [{ target: 'ac', op: 'add', value: 2 }]),
        effect('b', [{ target: 'ac', op: 'cap', value: 15 }]),
        effect('c', [{ target: 'ac', op: 'atLeast', value: 12 }])
      ]
    })
    expect(modifyNumber(10, 'ac', c)).toBe(12)
    expect(modifyNumber(20, 'ac', c)).toBe(15)
    expect(modifyNumber(1, 'ac', c)).toBe(12)
  })

  it('only applies a conditional modifier while its toggle is on', () => {
    const c = makeCharacter((ch) => {
      ch.customEffects = [effect('rage', [{ target: 'speed.walk', op: 'add', value: 10, when: 'raging' }])]
      ch.manualValues.speed = 30
    })
    expect(walkSpeed(c)).toBe(30)
    c.state.toggles.raging = true
    expect(walkSpeed(c)).toBe(40)
    expect(toggleNames(c)).toEqual(['raging'])
  })

  it('changes AC, hit point maximum, saves and ability modifiers', () => {
    const c = makeCharacter((ch) => {
      ch.abilityScores.dex = 12
      ch.manualValues.armorClass = 14
      ch.manualValues.maxHp = 40
      ch.manualValues.proficiencyBonus = 3
      ch.customEffects = [effect('x', [
        { target: 'ac', op: 'add', value: 1 }, { target: 'hp.max', op: 'add', value: -10 },
        { target: 'save.dex', op: 'add', value: 2 }, { target: 'ability.dex', op: 'add', value: 2 }
      ])]
    })
    expect(armorClass(c)).toBe(15)
    expect(maxHp(c)).toBe(30)
    expect(mod(c, 'dex')).toBe(2) // 14
    expect(saveBonus(c, 'dex')).toBe(4) // +2 modifier, +2 bonus
  })

  it('caps a resource, like a curse that limits Rage uses', () => {
    const rage = effect('rage', [], { uses: { max: 4, used: 0, resetOn: 'long' } })
    const curse = effect('curse', [{ target: 'resource.rage.max', op: 'cap', value: 1 }])
    const c = makeCharacter((ch) => { ch.customEffects = [rage, curse] })
    expect(resourceMax(c, rage)).toBe(1)
    curse.active = false
    expect(resourceMax(c, rage)).toBe(4)
  })

  it('adds resistances from active features', () => {
    const c = makeCharacter((ch) => {
      ch.defenses.resistances = ['Fire']
      ch.customEffects = [effect('r', [{ target: 'resistance', op: 'add', value: 'Cold' }])]
    })
    expect(effectiveDefenses(c).resistances).toEqual(['Fire', 'Cold'])
  })
})

describe('timed effects and triggers', () => {
  it('ends an effect and temporary HP when the in-game time passes', () => {
    const c = makeCharacter((ch) => {
      ch.customEffects = [effect('bless', [], { duration: { type: 'untilTime', at: 1000 } })]
      ch.state.tempHp = 5
      ch.state.tempHpExpires = { type: 'untilTime', at: 1000 }
    })
    expect(advanceTime(c, 999)).toEqual([])
    expect(c.state.tempHp).toBe(5)
    expect(advanceTime(c, 1)).toEqual(['bless', 'Temporary hit points'])
    expect(c.state.tempHp).toBe(0)
    expect(c.customEffects[0].active).toBe(false)
  })

  it('counts rounds down and ends the effect at zero', () => {
    const c = makeCharacter((ch) => { ch.customEffects = [effect('shield', [], { duration: { type: 'rounds', remaining: 2 } })] })
    expect(nextRound(c)).toEqual([])
    expect(nextRound(c)).toEqual(['shield'])
    expect(expireEffects(c)).toEqual([])
  })

  it('finds a heal trigger only while its feature is active', () => {
    const c = makeCharacter((ch) => {
      ch.customEffects = [effect('vampire', [], { triggers: [{ on: 'heal', action: 'damageInstead', ignoreResistance: true }] })]
    })
    expect(healTrigger(c)?.effect.name).toBe('vampire')
    c.customEffects[0].active = false
    expect(healTrigger(c)).toBeNull()
  })

  it('writes the game clock as day and time', () => {
    expect(formatGameTime(0)).toBe('Day 1, 00:00')
    expect(formatGameTime(11 * 1440 + 21 * 60 + 30)).toBe('Day 12, 21:30')
  })
})
