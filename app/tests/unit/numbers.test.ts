import { describe, expect, it } from 'vitest'
import { attackBonus, damageExpression } from '../../src/shared/rules/attacks'
import { attunedCount, totalWeight } from '../../src/shared/rules/inventory'
import { spellAttackBonus, spellSaveDC } from '../../src/shared/rules/spellcasting'
import { armorClass, classLabel, hitDicePools, totalLevel } from '../../src/shared/rules/summary'
import type { Attack } from '../../src/shared/schema/character'
import { makeCharacter } from './helpers'

const sword: Attack = {
  id: 'a1',
  name: 'Test Sword',
  ability: 'str',
  proficient: true,
  attackBonusExtra: 1,
  damage: '1d8',
  damageType: 'slashing',
  addAbilityToDamage: true,
  damageBonusExtra: 0,
  mastery: '',
  range: '',
  notes: ''
}

describe('attacks', () => {
  const c = makeCharacter((c) => {
    c.abilityScores.str = 16
    c.manualValues.proficiencyBonus = 2
  })

  it('attack bonus = ability mod + proficiency + extra', () => {
    expect(attackBonus(c, sword)).toBe(6)
    expect(attackBonus(c, { ...sword, proficient: false })).toBe(4)
  })

  it('damage expression adds the ability modifier', () => {
    expect(damageExpression(c, sword)).toBe('1d8+3')
    expect(damageExpression(c, { ...sword, addAbilityToDamage: false })).toBe('1d8')
    expect(damageExpression(makeCharacter((x) => (x.abilityScores.str = 8)), sword)).toBe('1d8-1')
  })
})

describe('spellcasting', () => {
  it('is null without a spellcasting ability', () => {
    expect(spellSaveDC(makeCharacter())).toBeNull()
    expect(spellAttackBonus(makeCharacter())).toBeNull()
  })

  it('save DC = 8 + proficiency + mod, attack = proficiency + mod', () => {
    const c = makeCharacter((c) => {
      c.abilityScores.wis = 17
      c.manualValues.proficiencyBonus = 3
      c.spellcasting.ability = 'wis'
    })
    expect(spellSaveDC(c)).toBe(14)
    expect(spellAttackBonus(c)).toBe(6)
  })
})

describe('summary', () => {
  const multiclass = makeCharacter((c) => {
    c.manualValues.classes = [
      { name: 'Alpha', subclass: 'Path X', level: 4, hitDie: 12 },
      { name: 'Beta', subclass: '', level: 2, hitDie: 8 },
      { name: 'Gamma', subclass: '', level: 1, hitDie: 12 }
    ]
    c.state.hitDiceUsed = { d12: 2 }
  })

  it('adds class levels together', () => {
    expect(totalLevel(multiclass)).toBe(7)
  })

  it('labels each class', () => {
    expect(classLabel(multiclass)).toBe('Alpha 4 (Path X) / Beta 2 / Gamma 1')
  })

  it('pools hit dice by die size, largest first', () => {
    expect(hitDicePools(multiclass)).toEqual([
      { die: 12, total: 5, used: 2 },
      { die: 8, total: 2, used: 0 }
    ])
  })

  it('uses hand-entered AC, or 10 + Dex when not set', () => {
    expect(armorClass(makeCharacter((c) => (c.abilityScores.dex = 14)))).toBe(12)
    expect(armorClass(makeCharacter((c) => (c.manualValues.armorClass = 17)))).toBe(17)
  })
})

describe('inventory', () => {
  it('totals weight and counts attuned items', () => {
    const c = makeCharacter((c) => {
      c.inventory = [
        { id: '1', itemId: null, name: 'A', quantity: 3, weight: 0.1, equipped: false, attuned: false, notes: '' },
        { id: '2', itemId: null, name: 'B', quantity: 1, weight: 6, equipped: true, attuned: true, notes: '' }
      ]
    })
    expect(totalWeight(c)).toBe(6.3)
    expect(attunedCount(c)).toBe(1)
  })
})
