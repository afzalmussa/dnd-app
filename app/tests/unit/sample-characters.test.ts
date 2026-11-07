// Local-only check: the sample characters made from the players' sheets must give the same
// saves, skills, passive Perception and initiative as the sheets print.
// Skipped when the files are missing (they are git-ignored and only exist on the DM's PC).

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from '../../src/shared/character'
import { SKILLS } from '../../src/shared/coreRules'
import { initiativeBonus, passivePerception, saveBonus, skillBonus } from '../../src/shared/rules/abilities'

const folder = join(process.cwd(), '..', 'reports', 'sample-characters')
const names = existsSync(folder)
  ? readdirSync(folder).filter((f) => f.endsWith('.json') && !f.endsWith('.expected.json'))
  : []

describe.skipIf(names.length === 0)('sample characters from the sheets', () => {
  for (const file of names) {
    const character = normalizeCharacter(JSON.parse(readFileSync(join(folder, file), 'utf-8')))
    const expected = JSON.parse(readFileSync(join(folder, file.replace('.json', '.expected.json')), 'utf-8'))

    it(`${character.name}: saves match the sheet`, () => {
      for (const [ability, total] of Object.entries(expected.saves)) {
        expect(saveBonus(character, ability as never), `${ability} save`).toBe(total)
      }
    })
    it(`${character.name}: skills match the sheet`, () => {
      for (const skill of SKILLS) {
        expect(skillBonus(character, skill.id), skill.name).toBe(expected.skills[skill.id])
      }
    })
    it(`${character.name}: passive Perception and initiative match the sheet`, () => {
      expect(passivePerception(character)).toBe(expected.passivePerception)
      expect(initiativeBonus(character)).toBe(expected.initiative)
    })
  }
})
