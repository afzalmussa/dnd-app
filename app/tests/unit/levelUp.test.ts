import { describe, expect, it } from 'vitest'
import {
  applyLevelUp, averageHp, missingChoices, planLevelUp, proficiencyBonusForLevel,
  type ClassData, type LevelUpChoices, type RulesData
} from '../../src/shared/rules/levelUp'
import { makeCharacter } from './helpers'

// A small invented class, so the test never depends on book text.
function fakeClass(): ClassData {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    level: i + 1,
    proficiencyBonus: proficiencyBonusForLevel(i + 1),
    featuresPrinted: i === 2 ? ['Test Subclass'] : i === 3 ? ['Ability Score Improvement'] : i === 4 ? ['Expertise'] : [],
    columns: { Cantrips: i < 3 ? 2 : 3, 'Prepared Spells': i + 2, Rages: 2 + Math.floor(i / 4) },
    spellSlots: [Math.min(4, 2 + i), i >= 2 ? 2 : null, null, null, null, null, null, null, null]
  }))
  return {
    id: 'class.test.phb24', name: 'Test', hitDie: 8, subclassLevel: 3,
    spellcasting: { ability: 'wis', casterType: 'full' }, progression: rows,
    features: [{ id: 'f1', name: 'Test Subclass', level: 3, text: 'Pick one.' }]
  }
}
const data = (cls: ClassData): RulesData => ({
  classes: [cls],
  subclasses: [{ id: 'sub.a', name: 'Alpha', classId: cls.id, ruleset: '2024', book: 'phb24', features: [{ id: 'sf', name: 'Alpha Gift', level: 3, text: 'A gift.' }] }],
  feats: [{ id: 'feat.x', name: 'Tough', category: 'Origin', prerequisite: null, text: 'More HP.', supersededBy: null, book: 'phb24', ruleset: '2024' }],
  spells: [
    { id: 's1', name: 'Zap', level: 0, school: null, castingTime: null, range: null, components: null, duration: null, concentration: false, ritual: false, classLists: ['Test'], text: '', higherLevels: null, book: 'phb24', ruleset: '2024' },
    { id: 's2', name: 'Bolt', level: 1, school: null, castingTime: null, range: null, components: null, duration: null, concentration: false, ritual: false, classLists: ['Test'], text: '', higherLevels: null, book: 'phb24', ruleset: '2024' }
  ],
  weapons: []
})
const character = (level: number) => makeCharacter((c) => {
  c.abilityScores.con = 14
  c.manualValues.maxHp = 20
  c.state.hpCurrent = 20
  c.manualValues.classes = [{ name: 'Test', subclass: '', level, hitDie: 8 }]
})
const empty: LevelUpChoices = { hp: { method: 'average', value: 0 }, picks: {}, asi: {}, notes: {} }

describe('level up plan', () => {
  it('uses the 2024 proficiency bonus steps and the average hit die', () => {
    expect([1, 4, 5, 8, 9, 13, 17, 20].map(proficiencyBonusForLevel)).toEqual([2, 2, 3, 3, 4, 5, 6, 6])
    expect([6, 8, 10, 12].map(averageHp)).toEqual([4, 5, 6, 7])
  })

  it('asks for a subclass at the subclass level and lists the new feature', () => {
    const cls = fakeClass()
    const plan = planLevelUp(character(2), cls, data(cls))
    expect(plan.newClassLevel).toBe(3)
    expect(plan.requirements.map((r) => r.kind)).toContain('subclass')
    expect(plan.features.map((f) => f.name)).toEqual(['Test Subclass'])
    expect(plan.proficiencyBonus).toBe(2)
  })

  it('asks for a score increase or feat at level 4 and expertise at level 5', () => {
    const cls = fakeClass()
    expect(planLevelUp(character(3), cls, data(cls)).requirements.map((r) => r.kind)).toContain('asiOrFeat')
    const lvl5 = makeCharacter((c) => {
      c.manualValues.classes = [{ name: 'Test', subclass: '', level: 4, hitDie: 8 }]
      c.proficiencies.skills = { stealth: 'proficient', arcana: 'proficient' }
    })
    const plan = planLevelUp(lvl5, cls, data(cls))
    const expertise = plan.requirements.find((r) => r.kind === 'expertise')
    expect(expertise && expertise.kind === 'expertise' && expertise.options.map((o) => o.id).sort()).toEqual(['arcana', 'stealth'])
    expect(plan.proficiencyBonus).toBe(3)
  })

  it('reports what is still missing, then applies the choices', () => {
    const cls = fakeClass()
    const c = character(2)
    const plan = planLevelUp(c, cls, data(cls))
    const subReq = plan.requirements.find((r) => r.kind === 'subclass')!
    expect(missingChoices(plan, empty).length).toBeGreaterThan(0)
    const choices: LevelUpChoices = { ...empty, picks: { [subReq.id]: ['sub.a'] } }
    // the cantrip and prepared-spell gains are also required
    const need = missingChoices(plan, choices)
    const spellReqs = plan.requirements.filter((r) => r.kind === 'spells')
    for (const r of spellReqs) if (r.kind === 'spells') choices.picks[r.id] = r.options.slice(0, r.count).map((o) => o.id)
    expect(need.length).toBeGreaterThan(0)
    expect(missingChoices(plan, choices)).toEqual([])
    const { character: after, changes } = applyLevelUp(c, plan, choices, cls)
    expect(after.manualValues.classes[0].level).toBe(3)
    expect(after.manualValues.classes[0].subclass).toBe('Alpha')
    expect(after.manualValues.maxHp).toBe(20 + 5 + 2) // average d8 = 5, Con 14 = +2
    expect(after.customEffects.map((e) => e.name)).toEqual(expect.arrayContaining(['Test Subclass', 'Alpha Gift']))
    expect(changes.join(' ')).toContain('Subclass: Alpha')
    expect(c.manualValues.classes[0].level).toBe(2) // the original is not changed
  })

  it('raises ability scores by +2 or +1/+1 and never above 20', () => {
    const cls = fakeClass()
    const c = character(3)
    c.abilityScores.str = 19
    const plan = planLevelUp(c, cls, data(cls))
    const asi = plan.requirements.find((r) => r.kind === 'asiOrFeat')!
    const choices: LevelUpChoices = { ...empty, asi: { [asi.id]: { mode: 'asi', abilities: ['str'], feat: '' } } }
    for (const r of plan.requirements) if (r.kind === 'spells') choices.picks[r.id] = r.options.slice(0, r.count).map((o) => o.id)
    const { character: after } = applyLevelUp(c, plan, choices, cls)
    expect(after.abilityScores.str).toBe(20)
  })

  it('starts a new class at level 1 for multiclassing', () => {
    const cls = fakeClass()
    const c = makeCharacter((ch) => { ch.manualValues.classes = [{ name: 'Other', subclass: '', level: 5, hitDie: 10 }] })
    const plan = planLevelUp(c, cls, data(cls))
    expect(plan.isNewClass).toBe(true)
    expect(plan.newClassLevel).toBe(1)
    expect(plan.newTotalLevel).toBe(6)
    expect(plan.warnings.join(' ')).toMatch(/Multiclass/)
  })
})
