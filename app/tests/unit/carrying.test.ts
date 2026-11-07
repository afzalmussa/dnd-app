import { describe, expect, it } from 'vitest'
import { carryingCapacity, dragLiftPushCapacity, parsePounds } from '../../src/shared/rules/carrying'
import { capacity, isOverCapacity } from '../../src/shared/rules/inventory'
import { makeCharacter } from './helpers'

// 2024 PHB Rules Glossary, Carrying Capacity: Small/Medium carry Str x 15 lb, drag/lift/push Str x 30 lb.
// The players' own sheets agree: Strength 10 -> 150 / 300 lb, Strength 18 -> 270 / 540 lb.
describe('carrying capacity (2024)', () => {
  it('is Strength times 15, and drag/lift/push is Strength times 30', () => {
    expect(carryingCapacity(10)).toBe(150)
    expect(dragLiftPushCapacity(10)).toBe(300)
    expect(carryingCapacity(18)).toBe(270)
    expect(dragLiftPushCapacity(18)).toBe(540)
  })
  it('reads book weights', () => {
    expect(parsePounds('5 lb.')).toBe(5)
    expect(parsePounds('1/2 lb.')).toBe(0.5)
    expect(parsePounds('58.5 lb.')).toBe(58.5)
    expect(parsePounds('Varies')).toBeNull()
    expect(parsePounds(null)).toBeNull()
  })
  it('flags a character carrying more than the limit', () => {
    const c = makeCharacter((ch) => {
      ch.abilityScores.str = 10
      ch.inventory = [{ id: 'a', itemId: null, name: 'Anvil', quantity: 1, weight: 151, equipped: false, attuned: false, notes: '' }]
    })
    expect(capacity(c).carry).toBe(150)
    expect(isOverCapacity(c)).toBe(true)
  })
})
