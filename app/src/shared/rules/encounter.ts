// Encounter tracking for the DM: combatants, initiative order, rounds, HP and XP.
// Pure functions that return new state, so they are easy to test.
//
// Difficulty (easy / medium / hard / deadly) is not worked out here: the XP threshold tables are in
// the Dungeon Master's Guide, and the one in the data pack is the 2014 book. The total XP is shown instead.

export interface MonsterStats {
  id: string
  name: string
  size: string
  creatureType: string
  alignment: string
  ac: number | null
  acNote: string | null
  initiative: { bonus: number; score: number } | null
  hp: { average: number; dice: string } | null
  speed: string | null
  abilities: Record<string, { score: number; mod: number; save: number }>
  skills: string | null
  resistances: string | null
  vulnerabilities: string | null
  immunities: string | null
  senses: string | null
  languages: string | null
  cr: string | null
  xp: number | null
  pb: number | null
  sections: Record<string, { name: string; text: string }[]>
  source: { page: number | null; flags: string[] }
}

export interface Combatant {
  id: string
  name: string
  monsterId: string | null // null for a player character or a one-off
  player: boolean
  initiative: number | null
  hpMax: number
  hp: number
  ac: number | null
  xp: number
  conditions: string[]
  note: string
}

export interface EncounterState {
  combatants: Combatant[]
  round: number
  turn: number // index into the sorted order
}

export const emptyEncounter = (): EncounterState => ({ combatants: [], round: 1, turn: 0 })

let counter = 0
export function newCombatantId(): string {
  counter += 1
  return `c${Date.now().toString(36)}${counter}`
}

// "Goblin" added three times becomes Goblin 1, Goblin 2, Goblin 3.
export function addMonsters(state: EncounterState, monster: MonsterStats, count: number): EncounterState {
  const same = state.combatants.filter((c) => c.monsterId === monster.id).length
  const added: Combatant[] = []
  for (let i = 0; i < count; i++) {
    const n = same + i + 1
    added.push({
      id: newCombatantId(), name: same + count > 1 ? `${monster.name} ${n}` : monster.name, monsterId: monster.id, player: false,
      initiative: null, hpMax: monster.hp?.average ?? 1, hp: monster.hp?.average ?? 1, ac: monster.ac, xp: monster.xp ?? 0, conditions: [], note: ''
    })
  }
  // A second group of a monster that was alone renames the first one to "Goblin 1".
  const renamed = same === 1 && count >= 1
    ? state.combatants.map((c) => (c.monsterId === monster.id && c.name === monster.name ? { ...c, name: `${monster.name} 1` } : c))
    : state.combatants
  return { ...state, combatants: [...renamed, ...added] }
}

export function addPlayer(state: EncounterState, name: string, initiative: number | null, hpMax: number, ac: number | null): EncounterState {
  const c: Combatant = { id: newCombatantId(), name, monsterId: null, player: true, initiative, hpMax, hp: hpMax, ac, xp: 0, conditions: [], note: '' }
  return { ...state, combatants: [...state.combatants, c] }
}

// Highest first. Combatants with no initiative yet go last. Ties keep the order they were added in.
export function turnOrder(state: EncounterState): Combatant[] {
  return state.combatants
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (b.c.initiative ?? -Infinity) - (a.c.initiative ?? -Infinity) || a.i - b.i)
    .map((x) => x.c)
}

export function rollInitiative(state: EncounterState, bonusFor: (c: Combatant) => number, random: () => number = Math.random): EncounterState {
  const combatants = state.combatants.map((c) =>
    c.player || c.initiative !== null ? c : { ...c, initiative: Math.floor(random() * 20) + 1 + bonusFor(c) })
  return { ...state, combatants, turn: 0 }
}

// Moves to the next creature; after the last one a new round starts.
export function nextTurn(state: EncounterState): EncounterState {
  const living = turnOrder(state).length
  if (living === 0) return state
  const next = state.turn + 1
  return next >= living ? { ...state, turn: 0, round: state.round + 1 } : { ...state, turn: next }
}

export function changeHp(state: EncounterState, id: string, delta: number): EncounterState {
  return {
    ...state,
    combatants: state.combatants.map((c) => (c.id === id ? { ...c, hp: Math.max(0, Math.min(c.hpMax, c.hp + delta)) } : c))
  }
}

export function totalXp(state: EncounterState): number {
  return state.combatants.reduce((sum, c) => sum + c.xp, 0)
}

export function removeCombatant(state: EncounterState, id: string): EncounterState {
  const order = turnOrder(state)
  const current = order[state.turn]?.id
  const combatants = state.combatants.filter((c) => c.id !== id)
  const after = turnOrder({ ...state, combatants })
  const turn = current && current !== id ? Math.max(0, after.findIndex((c) => c.id === current)) : Math.min(state.turn, Math.max(0, after.length - 1))
  return { ...state, combatants, turn }
}

export function formatCr(cr: string | null): string {
  return cr ?? '–'
}
