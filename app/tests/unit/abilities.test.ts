import { describe, expect, it } from 'vitest'
import {
  abilityModifier,
  formatBonus,
  initiativeBonus,
  passivePerception,
  saveBonus,
  skillBonus
} from '../../src/shared/rules/abilities'
import { makeCharacter } from './helpers'

describe('abilityModifier', () => {
  it.each([
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [17, 3],
    [20, 5],
    [30, 10]
  ])('score %i gives %i', (score, expected) => {
    expect(abilityModifier(score)).toBe(expected)
  })
})

describe('formatBonus', () => {
  it('adds a plus sign to zero and positives', () => {
    expect(formatBonus(0)).toBe('+0')
    expect(formatBonus(4)).toBe('+4')
    expect(formatBonus(-2)).toBe('-2')
  })
})

describe('saves and skills', () => {
  const character = makeCharacter((c) => {
    c.abilityScores.str = 16 // +3
    c.abilityScores.dex = 13 // +1
    c.abilityScores.wis = 12 // +1
    c.manualValues.proficiencyBonus = 3
    c.manualValues.initiativeBonus = 2
    c.proficiencies.savingThrows = ['str']
    c.proficiencies.skills = { athletics: 'proficient', perception: 'expertise' }
  })

  it('adds proficiency only to proficient saves', () => {
    expect(saveBonus(character, 'str')).toBe(6)
    expect(saveBonus(character, 'dex')).toBe(1)
  })

  it('adds proficiency once, or twice with expertise', () => {
    expect(skillBonus(character, 'athletics')).toBe(6)
    expect(skillBonus(character, 'perception')).toBe(7)
    expect(skillBonus(character, 'stealth')).toBe(1)
  })

  it('passive Perception is 10 + the Perception bonus', () => {
    expect(passivePerception(character)).toBe(17)
  })

  it('initiative is Dex modifier plus any extra bonus', () => {
    expect(initiativeBonus(character)).toBe(3)
  })

  it('treats a missing proficiency bonus as 0', () => {
    const noPb = makeCharacter((c) => (c.proficiencies.skills = { athletics: 'proficient' }))
    expect(skillBonus(noPb, 'athletics')).toBe(0)
  })

  it('rejects unknown skills', () => {
    expect(() => skillBonus(character, 'basket-weaving')).toThrow('Unknown skill')
  })
})
