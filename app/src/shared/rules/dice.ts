// Dice rolling. Every function takes an optional `random` function so tests
// can pass a fixed sequence instead of real randomness.

export type Random = () => number // returns a number from 0 (inclusive) to 1 (exclusive)
export type RollMode = 'normal' | 'advantage' | 'disadvantage'

export function rollDie(sides: number, random: Random = Math.random): number {
  return Math.floor(random() * sides) + 1
}

export interface D20Result {
  rolls: number[] // one roll, or two with advantage/disadvantage
  kept: number
  bonus: number
  total: number
  mode: RollMode
}

export function rollD20(bonus: number, mode: RollMode, random: Random = Math.random): D20Result {
  const first = rollDie(20, random)
  if (mode === 'normal') {
    return { rolls: [first], kept: first, bonus, total: first + bonus, mode }
  }
  const second = rollDie(20, random)
  const kept = mode === 'advantage' ? Math.max(first, second) : Math.min(first, second)
  return { rolls: [first, second], kept, bonus, total: kept + bonus, mode }
}

export interface DiceTerm {
  count: number
  sides: number
  sign: 1 | -1
}

export interface ParsedDice {
  dice: DiceTerm[]
  flat: number
}

// Reads expressions like "1d12+3", "2d6 + 1d4 - 1" or "d8".
// Returns null if the text is not a dice expression.
export function parseDice(text: string): ParsedDice | null {
  const compact = text.replace(/\s+/g, '').toLowerCase()
  if (compact === '') return null
  const termPattern = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g
  const result: ParsedDice = { dice: [], flat: 0 }
  let consumed = 0
  for (const match of compact.matchAll(termPattern)) {
    if (match.index !== consumed) return null // something unreadable in between
    // Only one of the two sign groups matches, depending on which half of the pattern hit.
    const sign = match[1] ?? match[4] ?? ''
    if (match.index > 0 && sign === '') return null // e.g. "1d62d6": second term has no + or -
    consumed += match[0].length
    if (match[3] !== undefined) {
      const sides = Number(match[3])
      const count = match[2] === '' ? 1 : Number(match[2])
      if (sides < 1 || count < 1) return null
      result.dice.push({ count, sides, sign: sign === '-' ? -1 : 1 })
    } else {
      result.flat += (sign === '-' ? -1 : 1) * Number(match[5])
    }
  }
  return consumed === compact.length ? result : null
}

export interface DiceResult {
  total: number
  rolls: { sides: number; value: number; sign: 1 | -1 }[]
  flat: number
}

// critical: true doubles the number of dice (a critical hit rolls the damage dice twice).
export function rollDice(parsed: ParsedDice, options: { critical?: boolean } = {}, random: Random = Math.random): DiceResult {
  const rolls: DiceResult['rolls'] = []
  for (const term of parsed.dice) {
    const count = options.critical ? term.count * 2 : term.count
    for (let i = 0; i < count; i++) {
      rolls.push({ sides: term.sides, value: rollDie(term.sides, random), sign: term.sign })
    }
  }
  const total = rolls.reduce((sum, r) => sum + r.sign * r.value, 0) + parsed.flat
  return { total, rolls, flat: parsed.flat }
}
