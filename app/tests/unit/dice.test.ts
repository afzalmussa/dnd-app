import { describe, expect, it } from 'vitest'
import { parseDice, rollD20, rollDice } from '../../src/shared/rules/dice'
import { face, fixedRandom } from './helpers'

describe('parseDice', () => {
  it('reads common expressions', () => {
    expect(parseDice('1d12+3')).toEqual({ dice: [{ count: 1, sides: 12, sign: 1 }], flat: 3 })
    expect(parseDice('2d6 + 1d4 - 1')).toEqual({
      dice: [
        { count: 2, sides: 6, sign: 1 },
        { count: 1, sides: 4, sign: 1 }
      ],
      flat: -1
    })
    expect(parseDice('d8')).toEqual({ dice: [{ count: 1, sides: 8, sign: 1 }], flat: 0 })
    expect(parseDice('5')).toEqual({ dice: [], flat: 5 })
  })

  it.each(['', 'abc', '1d', '2x6', '1d62d6', '1d0', '0d6'])('rejects %j', (text) => {
    expect(parseDice(text)).toBeNull()
  })
})

describe('rollD20', () => {
  it('normal roll adds the bonus', () => {
    const result = rollD20(5, 'normal', fixedRandom(face(12, 20)))
    expect(result).toMatchObject({ rolls: [12], kept: 12, total: 17 })
  })

  it('advantage keeps the higher, disadvantage the lower', () => {
    const random = () => fixedRandom(face(4, 20), face(15, 20))
    expect(rollD20(0, 'advantage', random()).kept).toBe(15)
    expect(rollD20(0, 'disadvantage', random()).kept).toBe(4)
  })

  it('covers 1 and 20', () => {
    expect(rollD20(0, 'normal', fixedRandom(0)).kept).toBe(1)
    expect(rollD20(0, 'normal', fixedRandom(0.9999)).kept).toBe(20)
  })
})

describe('rollDice', () => {
  const parsed = parseDice('2d6+3')!

  it('adds the dice and the flat bonus', () => {
    const result = rollDice(parsed, {}, fixedRandom(face(4, 6), face(5, 6)))
    expect(result.total).toBe(12)
    expect(result.rolls.map((r) => r.value)).toEqual([4, 5])
  })

  it('doubles the dice on a critical, not the flat bonus', () => {
    const result = rollDice(parsed, { critical: true }, fixedRandom(face(1, 6)))
    expect(result.rolls).toHaveLength(4)
    expect(result.total).toBe(7)
  })
})

describe('roll outcome colours', () => {
  it('is max when every die shows its highest face, min when every die shows 1', async () => {
    const { rollOutcome } = await import('../../src/shared/rules/dice')
    expect(rollOutcome([{ sides: 8, value: 8, sign: 1 }])).toBe('max')
    expect(rollOutcome([{ sides: 8, value: 1, sign: 1 }])).toBe('min')
    expect(rollOutcome([{ sides: 8, value: 6, sign: 1 }])).toBeUndefined()
    expect(rollOutcome([{ sides: 6, value: 6, sign: 1 }, { sides: 6, value: 5, sign: 1 }])).toBeUndefined()
    expect(rollOutcome([])).toBeUndefined()
  })
})
