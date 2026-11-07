// Creating, loading and naming character files.

import { CURRENT_SCHEMA_VERSION, type CharacterFile } from './schema/character'

export function newId(): string {
  return crypto.randomUUID()
}

export function createBlankCharacter(): CharacterFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId(),
    name: 'New Character',
    player: '',
    portrait: null,
    ruleset: '2024',
    origin: { backgroundIncreases: {}, originFeat: '' },
    speciesId: null,
    backgroundId: null,
    levels: [],
    speciesName: '',
    backgroundName: '',
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    manualValues: {
      classes: [{ name: '', subclass: '', level: 1, hitDie: 8 }],
      maxHp: null,
      proficiencyBonus: null,
      armorClass: null,
      speed: null,
      initiativeBonus: 0
    },
    proficiencies: { savingThrows: [], skills: {}, armor: [], weapons: [], tools: [], languages: [] },
    attacks: [],
    spellcasting: { ability: null, slotsMax: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    spells: [],
    inventory: [],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    defenses: { resistances: [], immunities: [], vulnerabilities: [] },
    senses: [],
    customEffects: [],
    state: {
      hpCurrent: 0,
      tempHp: 0,
      tempHpExpires: null,
      hitDiceUsed: {},
      deathSaves: { successes: 0, failures: 0 },
      inspiration: false,
      exhaustion: 0,
      conditions: [],
      spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      toggles: {}
    },
    dmOverrides: { featureLevels: {}, replacedEntries: {}, modifiers: [] },
    notes: { general: '', backstory: '', allies: '' }
  }
}

export class CharacterFileError extends Error {}

// Turns parsed JSON into a CharacterFile. Fields missing from an older or
// hand-edited file are filled from a blank character, so the sheet never
// crashes on a missing field. Anything that is clearly not a character
// file is rejected with a readable message.
export function normalizeCharacter(raw: unknown): CharacterFile {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CharacterFileError('The file does not contain a character (expected a JSON object).')
  }
  const data = raw as Record<string, unknown>
  if (typeof data.schemaVersion !== 'number') {
    throw new CharacterFileError('The file has no schemaVersion, so it is not a character file from this app.')
  }
  if (data.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new CharacterFileError(
      `The file was saved by a newer version of the app (schema ${data.schemaVersion}). Update the app to open it.`
    )
  }
  if (typeof data.id !== 'string' || typeof data.name !== 'string') {
    throw new CharacterFileError('The file is missing the character id or name.')
  }

  const blank = createBlankCharacter()
  const merged = { ...blank, ...data } as CharacterFile

  // One level deeper for the grouped sections, so a file that has some of a
  // section's fields still gets defaults for the rest.
  merged.abilityScores = { ...blank.abilityScores, ...(data.abilityScores as object) }
  merged.manualValues = { ...blank.manualValues, ...(data.manualValues as object) }
  merged.proficiencies = { ...blank.proficiencies, ...(data.proficiencies as object) }
  merged.spellcasting = { ...blank.spellcasting, ...(data.spellcasting as object) }
  merged.coins = { ...blank.coins, ...(data.coins as object) }
  merged.defenses = { ...blank.defenses, ...(data.defenses as object) }
  merged.state = { ...blank.state, ...(data.state as object) }
  merged.dmOverrides = { ...blank.dmOverrides, ...(data.dmOverrides as object) }
  merged.notes = { ...blank.notes, ...(data.notes as object) }
  merged.origin = { ...blank.origin, ...(data.origin as object) }
  merged.ruleset = '2024'
  merged.schemaVersion = CURRENT_SCHEMA_VERSION
  return merged
}

// "Grok the Loud" + id "3f2a9c..." -> "grok-the-loud-3f2a9c.json"
// The id part keeps two characters with the same name from overwriting each other.
export function fileNameFor(character: CharacterFile): string {
  const slug = character.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'character'}-${character.id.slice(0, 6)}.json`
}
