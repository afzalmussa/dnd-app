// Turns dice results into entries for the roll log.

import { formatBonus } from '../../shared/rules/abilities'
import { parseDice, rollD20, rollDice, type RollMode } from '../../shared/rules/dice'

export interface RollEntry {
  id: number
  time: string
  label: string
  detail: string
  total: number
  natural?: 'nat20' | 'nat1'
}

let nextId = 1

function now(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function d20Entry(label: string, bonus: number, mode: RollMode): RollEntry {
  const result = rollD20(bonus, mode)
  const modeText = mode === 'advantage' ? ' adv' : mode === 'disadvantage' ? ' dis' : ''
  return {
    id: nextId++,
    time: now(),
    label,
    detail: `d20 [${result.rolls.join(', ')}]${modeText} ${formatBonus(bonus)}`,
    total: result.total,
    natural: result.kept === 20 ? 'nat20' : result.kept === 1 ? 'nat1' : undefined
  }
}

// Returns null if the expression can't be read (for example a typo in a weapon's damage).
export function diceEntry(label: string, expression: string, critical = false): RollEntry | null {
  const parsed = parseDice(expression)
  if (!parsed) return null
  const result = rollDice(parsed, { critical })
  const dice = result.rolls.map((r) => `${r.sign < 0 ? '-' : ''}${r.value}`).join(', ')
  const flat = result.flat !== 0 ? ` ${formatBonus(result.flat)}` : ''
  return {
    id: nextId++,
    time: now(),
    label: critical ? `${label} (critical)` : label,
    detail: `${expression} [${dice}]${flat}`,
    total: result.total
  }
}
