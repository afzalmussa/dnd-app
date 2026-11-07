import { describe, expect, it } from 'vitest'
import { partyMember } from '../../src/shared/rules/party'
import { makeCharacter } from './helpers'

describe('DM party summary', () => {
  it('shows HP, AC, passive Perception, slots left and resources left', () => {
    const c = makeCharacter((ch) => {
      ch.name = 'Test'
      ch.abilityScores.wis = 14
      ch.manualValues.proficiencyBonus = 3
      ch.manualValues.maxHp = 40
      ch.manualValues.armorClass = 16
      ch.manualValues.speed = 30
      ch.proficiencies.skills = { perception: 'proficient' }
      ch.state.hpCurrent = 25
      ch.state.tempHp = 3
      ch.spellcasting.slotsMax = [4, 3, 0, 0, 0, 0, 0, 0, 0]
      ch.state.spellSlotsUsed = [1, 3, 0, 0, 0, 0, 0, 0, 0]
      ch.customEffects = [{
        id: 'rage', name: 'Rage', kind: 'feature', source: '', description: '', activation: 'bonus', active: true,
        uses: { max: 3, used: 2, resetOn: 'long' }, modifiers: [], triggers: [], duration: { type: 'permanent' }
      }]
    })
    const m = partyMember('test.json', c)
    expect(m.hp).toEqual({ current: 25, max: 40, temp: 3 })
    expect(m.armorClass).toBe(16)
    expect(m.passivePerception).toBe(10 + 2 + 3)
    expect(m.slots).toEqual([{ level: 1, max: 4, left: 3 }, { level: 2, max: 3, left: 0 }])
    expect(m.resources).toEqual([{ name: 'Rage', max: 3, left: 1 }])
  })
})
