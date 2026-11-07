import { describe, expect, it } from 'vitest'
import {
  addMonsters, addPlayer, changeHp, emptyEncounter, nextTurn, removeCombatant, rollInitiative, totalXp, turnOrder,
  type MonsterStats
} from '../../src/shared/rules/encounter'

const goblin: MonsterStats = {
  id: 'monster.goblin.mm', name: 'Goblin', size: 'Small', creatureType: 'Fey', alignment: 'Chaotic Neutral', ac: 15, acNote: null,
  initiative: { bonus: 2, score: 12 }, hp: { average: 10, dice: '3d6' }, speed: '30 ft.', abilities: {}, skills: null, resistances: null,
  vulnerabilities: null, immunities: null, senses: null, languages: null, cr: '1/4', xp: 50, pb: 2, sections: {}, source: { page: 1, flags: [] }
}

describe('encounter tracker', () => {
  it('numbers several of the same monster and sums XP', () => {
    let s = addMonsters(emptyEncounter(), goblin, 3)
    expect(s.combatants.map((c) => c.name)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3'])
    expect(totalXp(s)).toBe(150)
    s = addMonsters(addMonsters(emptyEncounter(), goblin, 1), goblin, 1)
    expect(s.combatants.map((c) => c.name)).toEqual(['Goblin 1', 'Goblin 2'])
    expect(addMonsters(emptyEncounter(), goblin, 1).combatants[0].name).toBe('Goblin')
  })

  it('rolls initiative for monsters only and orders highest first', () => {
    let s = addMonsters(emptyEncounter(), goblin, 2)
    s = addPlayer(s, 'Auriviel', 14, 43, 15)
    const rolls = [0.5, 0.0] // d20 gives 11 then 1
    let i = 0
    s = rollInitiative(s, (c) => (c.monsterId ? 2 : 0), () => rolls[i++])
    expect(s.combatants.map((c) => c.initiative)).toEqual([13, 3, 14])
    expect(turnOrder(s).map((c) => c.name)).toEqual(['Auriviel', 'Goblin 1', 'Goblin 2'])
  })

  it('moves through turns and starts a new round after the last', () => {
    let s = addPlayer(addPlayer(emptyEncounter(), 'A', 10, 5, 10), 'B', 5, 5, 10)
    s = nextTurn(s)
    expect(s).toMatchObject({ turn: 1, round: 1 })
    s = nextTurn(s)
    expect(s).toMatchObject({ turn: 0, round: 2 })
  })

  it('keeps hit points between 0 and the maximum', () => {
    let s = addMonsters(emptyEncounter(), goblin, 1)
    const id = s.combatants[0].id
    s = changeHp(s, id, -4)
    expect(s.combatants[0].hp).toBe(6)
    expect(changeHp(s, id, -99).combatants[0].hp).toBe(0)
    expect(changeHp(s, id, 99).combatants[0].hp).toBe(10)
  })

  it('keeps the current turn on the same creature when another is removed', () => {
    let s = addPlayer(addPlayer(addPlayer(emptyEncounter(), 'A', 20, 5, 10), 'B', 10, 5, 10), 'C', 5, 5, 10)
    s = nextTurn(s) // B's turn
    const a = s.combatants[0].id
    s = removeCombatant(s, a)
    expect(turnOrder(s)[s.turn].name).toBe('B')
  })
})
