// Local-only: plans a level-up from the real imported data pack. Skipped when it is missing.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from '../../src/shared/character'
import { missingChoices, planLevelUp, type ClassData, type RulesData } from '../../src/shared/rules/levelUp'

const root = join(process.cwd(), '..')
const pack = join(root, 'data-pack', 'phb24', 'classes.json')
const sheets = join(root, 'reports', 'sample-characters')

describe.skipIf(!existsSync(pack) || !existsSync(join(sheets, 'thrandur-lorgrin.json')))('level up with the real data pack', () => {
  const read = (f: string) => JSON.parse(readFileSync(f, 'utf-8'))
  const classes: ClassData[] = read(pack)
  const data: RulesData = { classes, subclasses: [], feats: [], spells: read(join(root, 'data-pack', 'phb24', 'spells.json')).map((s: any) => ({ ...s, book: 'phb24', ruleset: '2024', text: s.text ?? '' })), weapons: [] }
  const load = (name: string) => normalizeCharacter(read(join(sheets, name)))
  const classNamed = (n: string) => classes.find((c) => c.name === n)!

  it('Barbarian 6 to 7 gains its level 7 features with no choices', () => {
    const plan = planLevelUp(load('thrandur-lorgrin.json'), classNamed('Barbarian'), data)
    expect(plan.newClassLevel).toBe(7)
    expect(plan.features.map((f) => f.name)).toEqual(expect.arrayContaining(['Feral Instinct', 'Instinctive Pounce']))
    expect(plan.proficiencyBonus).toBe(3)
  })

  it('Cleric 6 to 7 asks for one more prepared spell', () => {
    const c = load('auriviel-inferno.json')
    const plan = planLevelUp(c, classNamed('Cleric'), data)
    const prepared = plan.requirements.find((r) => r.kind === 'spells' && r.id.endsWith('prepared'))
    expect(prepared && prepared.kind === 'spells' && prepared.count).toBe(1)
    expect(plan.slots?.slice(0, 4)).toEqual([4, 3, 3, 1])
    expect(missingChoices(plan, { hp: { method: 'average', value: 0 }, picks: {}, asi: {}, notes: {} }).length).toBeGreaterThan(0)
  })

  it('Wizard 3 to 4 would ask for an Ability Score Improvement', () => {
    const c = load('ordizon.json')
    c.manualValues.classes[0].level = 3
    const plan = planLevelUp(c, classNamed('Wizard'), data)
    expect(plan.requirements.map((r) => r.kind)).toContain('asiOrFeat')
  })
})
