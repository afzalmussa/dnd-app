import { describe, expect, it } from 'vitest'
import { applyDamage, applyHealing, gainTempHp } from '../../src/shared/rules/hitPoints'
import { makeCharacter } from './helpers'

function withHp(current: number, temp = 0) {
  return makeCharacter((c) => {
    c.state.hpCurrent = current
    c.state.tempHp = temp
  })
}

describe('applyDamage', () => {
  it('takes damage from temp HP first', () => {
    const c = withHp(20, 5)
    applyDamage(c, 8)
    expect(c.state.tempHp).toBe(0)
    expect(c.state.hpCurrent).toBe(17)
  })

  it('leaves current HP alone when temp HP covers it', () => {
    const c = withHp(20, 10)
    applyDamage(c, 4)
    expect(c.state.tempHp).toBe(6)
    expect(c.state.hpCurrent).toBe(20)
  })

  it('stops at 0', () => {
    const c = withHp(5)
    applyDamage(c, 50)
    expect(c.state.hpCurrent).toBe(0)
  })

  it('ignores zero and negative amounts', () => {
    const c = withHp(5)
    applyDamage(c, -3)
    expect(c.state.hpCurrent).toBe(5)
  })
})

describe('applyHealing', () => {
  it('does not go above max HP', () => {
    const c = withHp(18)
    applyHealing(c, 10, 20)
    expect(c.state.hpCurrent).toBe(20)
  })

  it('clears death saves when healed from 0', () => {
    const c = withHp(0)
    c.state.deathSaves = { successes: 1, failures: 2 }
    applyHealing(c, 3, 20)
    expect(c.state.hpCurrent).toBe(3)
    expect(c.state.deathSaves).toEqual({ successes: 0, failures: 0 })
  })
})

describe('gainTempHp', () => {
  it('keeps the higher value instead of adding', () => {
    const c = withHp(10, 6)
    gainTempHp(c, 4)
    expect(c.state.tempHp).toBe(6)
    gainTempHp(c, 9)
    expect(c.state.tempHp).toBe(9)
  })
})
