// Modifiers, durations and triggers. One shape is shared by class features,
// feats, items, DM overrides and homebrew, so the sheet has one place that
// applies them. Milestone 1 stores these but does not apply modifiers yet;
// that arrives with the custom feature editor in Milestone 4.

export interface Modifier {
  // What it changes, e.g. "ac", "speed.walk", "hp.max", "save.dex",
  // "skill.stealth", "resource.<effectId>.max", "resistance".
  target: string
  // add: plus or minus. set: replace. cap: can't go above. atLeast: can't go below.
  op: 'add' | 'set' | 'cap' | 'atLeast'
  value: number | string
  // Name of a toggle on the sheet (e.g. "raging"). When set, the modifier only
  // applies while that toggle is on.
  when?: string
}

export type Duration =
  | { type: 'permanent' }
  | { type: 'untilRest'; rest: 'short' | 'long' }
  | { type: 'rounds'; remaining: number }
  // In-game minutes since the campaign clock started (set by the DM).
  | { type: 'untilTime'; at: number }

// Small fixed list. New trigger types are added when a real case needs one.
export type Trigger = { on: 'heal'; action: 'damageInstead'; ignoreResistance: boolean }

export type RestType = 'short' | 'long'
export type Activation = 'action' | 'bonus' | 'reaction' | 'free' | 'passive'
