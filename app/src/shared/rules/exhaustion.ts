// Exhaustion, from the 2024 PHB Rules Glossary ("Exhaustion [Condition]"):
//   - Each level reduces every D20 Test (checks, saves, attack rolls) by 2.
//   - Each level reduces Speed by 5 feet.
//   - You die at level 6.
// Finishing a Long Rest removes 1 level (see rest.ts).

export const MAX_EXHAUSTION = 6

export function clampExhaustion(level: number): number {
  return Math.min(MAX_EXHAUSTION, Math.max(0, Math.floor(level)))
}

export function exhaustionRollPenalty(level: number): number {
  return 2 * clampExhaustion(level)
}

export function exhaustionSpeedPenalty(level: number): number {
  return 5 * clampExhaustion(level)
}

export function effectiveSpeed(speed: number | null, level: number): number | null {
  return speed === null ? null : Math.max(0, speed - exhaustionSpeedPenalty(level))
}

export function isDeadFromExhaustion(level: number): boolean {
  return level >= MAX_EXHAUSTION
}
