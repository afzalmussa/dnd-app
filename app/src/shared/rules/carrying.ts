// Weights and carrying capacity, from the 2024 PHB Rules Glossary, "Carrying Capacity" table:
//   Small/Medium creature: carry Str x 15 lb., drag/lift/push Str x 30 lb.
// (Other sizes are in the table too; player characters are Small or Medium.)

export const CARRY_PER_STRENGTH = 15
export const DRAG_PER_STRENGTH = 30

export function carryingCapacity(strength: number): number {
  return Math.max(0, strength) * CARRY_PER_STRENGTH
}

export function dragLiftPushCapacity(strength: number): number {
  return Math.max(0, strength) * DRAG_PER_STRENGTH
}

// Turns the weights printed in the books into pounds: "5 lb.", "1/2 lb.", "58.5 lb.".
// Returns null for "Varies" or an empty weight.
export function parsePounds(text: string | null | undefined): number | null {
  if (!text) return null
  const m = text.match(/^\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?\s*lb/i)
  if (!m) return null
  return m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1])
}
