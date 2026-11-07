import { describe, expect, it } from 'vitest'
import {
  clampExhaustion,
  effectiveSpeed,
  exhaustionRollPenalty,
  exhaustionSpeedPenalty,
  isDeadFromExhaustion
} from '../../src/shared/rules/exhaustion'

// Values from the 2024 PHB Rules Glossary, "Exhaustion [Condition]":
// D20 Tests reduced by 2 per level, Speed by 5 feet per level, death at level 6.
describe('exhaustion (2024)', () => {
  it('reduces D20 Tests by 2 per level', () => {
    expect([0, 1, 3, 6].map(exhaustionRollPenalty)).toEqual([0, 2, 6, 12])
  })
  it('reduces Speed by 5 feet per level and never below 0', () => {
    expect(exhaustionSpeedPenalty(2)).toBe(10)
    expect(effectiveSpeed(30, 2)).toBe(20)
    expect(effectiveSpeed(30, 6)).toBe(0)
    expect(effectiveSpeed(null, 3)).toBeNull()
  })
  it('keeps the level between 0 and 6 and kills at 6', () => {
    expect(clampExhaustion(9)).toBe(6)
    expect(clampExhaustion(-1)).toBe(0)
    expect(isDeadFromExhaustion(6)).toBe(true)
    expect(isDeadFromExhaustion(5)).toBe(false)
  })
})
