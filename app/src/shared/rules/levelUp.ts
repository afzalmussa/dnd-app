// Level-up: works out what a new class level brings and what the player must decide,
// then applies the decisions. Everything comes from the imported class data; nothing is
// hard-coded per class. Pure functions, so they are easy to test.
//
// 2024 rules used (PHB): proficiency bonus follows total character level; a new class starts at
// level 1; subclass is chosen at the level the class table names; the Ability Score Improvement
// feature gives +2/+1+1 (max 20) or a feat.

import { newId } from '../character'
import type { FeatInfo, ItemInfo, SpellInfo } from '../api'
import { SKILLS } from '../coreRules'
import type { Ability, CharacterFile, CustomEffect, SpellEntry } from '../schema/character'
import { mod } from './abilities'
import { detailsFromSpell } from './spellData'

export interface FeatureData { id: string; name: string; level: number; text: string; printedLevel?: number }
export interface ProgressionRow {
  level: number
  proficiencyBonus: number | null
  featuresPrinted: string[]
  columns: Record<string, number | string | null>
  spellSlots: (number | null)[] | null
}
export interface ClassData {
  id: string
  name: string
  hitDie: number | null
  subclassLevel: number | null
  spellcasting: { ability: Ability | null; casterType: string | null } | null
  primaryAbilities?: Ability[]
  primaryOr?: boolean // the book prints "Strength or Dexterity" rather than "and"
  progression: ProgressionRow[]
  features: FeatureData[]
}
export interface SubclassData { id: string; name: string; classId: string; ruleset: string; book: string; features: FeatureData[] }

// From the PHB multiclassing pages (data-pack/phb24/multiclassing.json).
export interface MulticlassData {
  prerequisite: { minimumScore: number | null }
  casterLevelRule: { full: string[]; half: string[]; third: { classes: string[]; subclasses: string[] } | null }
  slotTable: { level: number; slots: number[] }[]
}

export interface RulesData {
  multiclass?: MulticlassData | null
  classes: ClassData[]
  subclasses: SubclassData[]
  feats: FeatInfo[]
  spells: SpellInfo[]
  weapons: ItemInfo[]
}

export type Requirement =
  | { kind: 'subclass'; id: string; prompt: string; options: SubclassData[] }
  | { kind: 'asiOrFeat'; id: string; prompt: string; feats: FeatInfo[] }
  | { kind: 'spells'; id: string; prompt: string; count: number; options: SpellInfo[] }
  | { kind: 'expertise'; id: string; prompt: string; count: number; options: { id: string; name: string }[] }
  | { kind: 'weaponMastery'; id: string; prompt: string; count: number; options: string[] }
  | { kind: 'note'; id: string; prompt: string }

export interface TableChange { column: string; from: number | string | null; to: number | string | null }

export interface LevelUpPlan {
  classId: string
  className: string
  isNewClass: boolean
  newClassLevel: number
  newTotalLevel: number
  hitDie: number
  averageHp: number
  features: FeatureData[]
  requirements: Requirement[]
  proficiencyBonus: number
  slots: number[] | null
  tableChanges: TableChange[]
  warnings: string[]
}

export interface AsiChoice { mode: 'asi' | 'feat'; abilities: Ability[]; feat: string }
export interface LevelUpChoices {
  hp: { method: 'average' | 'rolled' | 'manual'; value: number }
  picks: Record<string, string[]>
  asi: Record<string, AsiChoice>
  notes: Record<string, string>
}

export const MAX_ABILITY_SCORE = 20

export function proficiencyBonusForLevel(totalLevel: number): number {
  return 2 + Math.floor((totalLevel - 1) / 4)
}

export function averageHp(hitDie: number): number {
  return Math.floor(hitDie / 2) + 1
}

export function totalCharacterLevel(character: CharacterFile): number {
  return character.manualValues.classes.reduce((sum, c) => sum + c.level, 0)
}

function numberColumn(row: ProgressionRow | undefined, name: string): number {
  const v = row?.columns[name]
  return typeof v === 'number' ? v : 0
}

function highestSlotLevel(slots: (number | null)[] | null): number {
  if (!slots) return 0
  let top = 0
  slots.forEach((n, i) => { if (n) top = i + 1 })
  return top
}

// Caster level for the multiclass spell slot table: full levels, half (rounded up) and a third (rounded down).
export function casterLevel(classes: { name: string; level: number; subclass: string }[], rule: MulticlassData['casterLevelRule']): number {
  const has = (list: string[], name: string) => list.some((n) => n.toLowerCase() === name.toLowerCase())
  let total = 0
  for (const c of classes) {
    if (has(rule.full, c.name)) total += c.level
    else if (has(rule.half, c.name)) total += Math.ceil(c.level / 2)
    else if (rule.third && has(rule.third.classes, c.name) && has(rule.third.subclasses, c.subclass)) total += Math.floor(c.level / 3)
  }
  return total
}

// The score needed in the new class's primary ability (and each current class's) to multiclass.
export function multiclassProblems(character: CharacterFile, newClass: ClassData, all: ClassData[], minimum: number): string[] {
  const problems: string[] = []
  const check = (cls: ClassData | undefined) => {
    if (!cls?.primaryAbilities?.length) return
    const ok = cls.primaryOr
      ? cls.primaryAbilities.some((a) => character.abilityScores[a] >= minimum)
      : cls.primaryAbilities.every((a) => character.abilityScores[a] >= minimum)
    if (!ok) problems.push(`${cls.name} needs ${cls.primaryAbilities.map((a) => a.toUpperCase()).join(cls.primaryOr ? ' or ' : ' and ')} ${minimum} or higher`)
  }
  check(newClass)
  for (const c of character.manualValues.classes.filter((x) => x.level > 0)) check(all.find((k) => k.name.toLowerCase() === c.name.toLowerCase()))
  return problems
}

// What the new level brings and what the player has to choose.
export function planLevelUp(character: CharacterFile, cls: ClassData, data: RulesData): LevelUpPlan {
  const existing = character.manualValues.classes.find((c) => c.name.toLowerCase() === cls.name.toLowerCase() && c.level > 0)
  const newClassLevel = (existing?.level ?? 0) + 1
  const row = cls.progression.find((r) => r.level === newClassLevel)
  const before = cls.progression.find((r) => r.level === newClassLevel - 1)
  const warnings: string[] = []
  const requirements: Requirement[] = []
  if (!row) throw new Error(`${cls.name} has no level ${newClassLevel} in the imported data.`)
  if (newClassLevel > 20) throw new Error(`${cls.name} is already level 20.`)

  const features = cls.features.filter((f) => f.level === newClassLevel)
  const names = row.featuresPrinted.map((n) => n.toLowerCase())
  const rid = (suffix: string) => `${cls.id}.${newClassLevel}.${suffix}`

  // Features named in the table but without their own text (e.g. "Subclass feature") are described by the subclass.
  if (cls.subclassLevel === newClassLevel) {
    requirements.push({
      kind: 'subclass', id: rid('subclass'), prompt: `Choose your ${cls.name} subclass`,
      options: data.subclasses.filter((s) => s.classId === cls.id)
    })
  }
  const asiNames = names.filter((n) => n.includes('ability score improvement') || n.includes('epic boon'))
  for (const n of asiNames) {
    requirements.push({ kind: 'asiOrFeat', id: rid(n.includes('epic') ? 'epicBoon' : 'asi'), prompt: n.includes('epic') ? 'Choose an Epic Boon feat' : 'Ability Score Improvement: raise your scores or take a feat', feats: data.feats })
  }

  // Spellcasting: more cantrips and prepared spells than last level.
  const cantripGain = numberColumn(row, 'Cantrips') - numberColumn(before, 'Cantrips')
  const preparedGain = numberColumn(row, 'Prepared Spells') - numberColumn(before, 'Prepared Spells')
  const slotsTop = highestSlotLevel(row.spellSlots)
  const classSpells = data.spells.filter((s) => s.classLists.some((c) => c.toLowerCase() === cls.name.toLowerCase()))
  const known = new Set(character.spells.map((s) => s.name.toLowerCase()))
  if (cantripGain > 0) {
    requirements.push({
      kind: 'spells', id: rid('cantrips'), count: cantripGain, prompt: `Learn ${cantripGain} new ${cls.name} cantrip${cantripGain > 1 ? 's' : ''}`,
      options: classSpells.filter((s) => s.level === 0 && !known.has(s.name.toLowerCase()))
    })
  }
  if (preparedGain > 0) {
    requirements.push({
      kind: 'spells', id: rid('prepared'), count: preparedGain,
      prompt: `Prepare ${preparedGain} more ${cls.name} spell${preparedGain > 1 ? 's' : ''} (level ${slotsTop || 1} or lower)`,
      options: classSpells.filter((s) => (s.level ?? 0) > 0 && (s.level ?? 0) <= Math.max(slotsTop, 1) && !known.has(s.name.toLowerCase()))
    })
  }
  if (cls.spellcasting && (cantripGain > 0 || preparedGain > 0 || (existing && cls.spellcasting)) && newClassLevel > 1) {
    requirements.push({ kind: 'note', id: rid('swap'), prompt: 'Optional: spell swaps this level (which spell you replace and with what)' })
  }

  // Expertise and weapon mastery.
  if (names.some((n) => n.startsWith('expertise'))) {
    const proficient = SKILLS.filter((s) => character.proficiencies.skills[s.id] === 'proficient')
    requirements.push({ kind: 'expertise', id: rid('expertise'), count: 2, prompt: 'Expertise: choose 2 skills you are proficient in', options: proficient.map((s) => ({ id: s.id, name: s.name })) })
  }
  const masteryGain = numberColumn(row, 'Weapon Mastery') - numberColumn(before, 'Weapon Mastery')
  if (masteryGain > 0 || (newClassLevel === 1 && numberColumn(row, 'Weapon Mastery') > 0)) {
    const count = Math.max(masteryGain, numberColumn(row, 'Weapon Mastery') && newClassLevel === 1 ? numberColumn(row, 'Weapon Mastery') : masteryGain)
    requirements.push({
      kind: 'weaponMastery', id: rid('mastery'), count, prompt: `Weapon Mastery: choose ${count} more kind${count > 1 ? 's' : ''} of weapon`,
      options: data.weapons.filter((w) => w.category === 'weapon' && w.mastery).map((w) => `${w.name} (${w.mastery})`)
    })
  }

  // Other features that ask the player to choose something: describe them and record the choice as a note.
  const choiceWords = ['fighting style', 'metamagic', 'eldritch invocations', 'pact', 'divine order', 'primal order', 'favored enemy', 'scholar', 'blessed strikes', 'land', 'draconic', 'bonus proficiencies']
  for (const f of features) {
    const lower = f.name.toLowerCase()
    if (choiceWords.some((w) => lower.includes(w)) || /\bchoose\b/i.test(f.text.slice(0, 400))) {
      requirements.push({ kind: 'note', id: rid(`choice.${f.id}`), prompt: `${f.name}: write down what you chose (see the description above)` })
    }
  }
  if (!existing && character.manualValues.classes.some((c) => c.level > 0)) {
    requirements.push({ kind: 'note', id: rid('multiclass'), prompt: 'New class: write the proficiencies you gain and check the multiclass requirements in the PHB' })
    if (data.multiclass?.prerequisite.minimumScore) {
      const bad = multiclassProblems(character, cls, data.classes, data.multiclass.prerequisite.minimumScore)
      for (const b of bad) warnings.push(`Multiclass prerequisite not met: ${b}. The DM can override this.`)
    }
    warnings.push('You gain only some of the new class\'s starting proficiencies (PHB, Multiclassing). Write them in the box above.')
  }
  const casters = new Set(character.manualValues.classes.filter((c) => c.level > 0).map((c) => c.name.toLowerCase()))
  casters.add(cls.name.toLowerCase())
  const slotClasses = data.classes.filter((c) => casters.has(c.name.toLowerCase()) && c.progression.some((r) => r.spellSlots))
  let multiclassSlots: number[] | null = null
  if (slotClasses.length > 1 || (data.multiclass && character.manualValues.classes.filter((c) => c.level > 0).length + (existing ? 0 : 1) > 1)) {
    if (data.multiclass) {
      const after = character.manualValues.classes.filter((c) => c.level > 0).map((c) => ({ ...c }))
      const mine = after.find((c) => c.name.toLowerCase() === cls.name.toLowerCase())
      if (mine) mine.level = newClassLevel
      else after.push({ name: cls.name, subclass: '', level: newClassLevel, hitDie: cls.hitDie ?? 8 })
      const level = casterLevel(after, data.multiclass.casterLevelRule)
      const row = data.multiclass.slotTable.find((r) => r.level === level)
      multiclassSlots = row ? row.slots : Array(9).fill(0)
      warnings.push(`Spell slots follow the Multiclass Spellcaster table (caster level ${level}). Pact Magic slots from Warlock are separate.`)
    } else if (slotClasses.length > 1) {
      warnings.push('More than one spellcasting class: spell slots follow the multiclass table, which is not in the data pack. Set the slots on the Spells tab.')
    }
  }

  const tableChanges: TableChange[] = []
  for (const [column, value] of Object.entries(row.columns)) {
    const old = before?.columns[column] ?? null
    if (value !== old && value !== null) tableChanges.push({ column, from: old, to: value })
  }

  const totalBefore = totalCharacterLevel(character)
  return {
    classId: cls.id,
    className: cls.name,
    isNewClass: !existing,
    newClassLevel,
    newTotalLevel: totalBefore + 1,
    hitDie: cls.hitDie ?? 8,
    averageHp: averageHp(cls.hitDie ?? 8),
    features,
    requirements,
    proficiencyBonus: proficiencyBonusForLevel(totalBefore + 1),
    slots: multiclassSlots ?? (row.spellSlots && slotClasses.length <= 1 ? Array.from({ length: 9 }, (_, i) => row.spellSlots?.[i] ?? 0) : null),
    tableChanges,
    warnings
  }
}

// What is still missing before the level-up can be applied. An empty list means it is ready.
export function missingChoices(plan: LevelUpPlan, choices: LevelUpChoices): string[] {
  const missing: string[] = []
  if (choices.hp.method !== 'average' && !(choices.hp.value >= 1)) missing.push('Hit points: enter or roll a value')
  for (const req of plan.requirements) {
    if (req.kind === 'note') continue // notes are optional
    if (req.kind === 'asiOrFeat') {
      const a = choices.asi[req.id]
      if (!a) { missing.push(req.prompt); continue }
      if (a.mode === 'feat' && !a.feat) missing.push('Choose a feat')
      if (a.mode === 'asi' && !(a.abilities.length === 1 || a.abilities.length === 2)) missing.push('Choose one ability (+2) or two abilities (+1 each)')
      continue
    }
    const picked = choices.picks[req.id] ?? []
    const need = req.kind === 'subclass' ? 1 : req.count
    if (picked.length !== need) missing.push(`${req.prompt} (${picked.length}/${need})`)
  }
  return missing
}

function featEffect(name: string, source: string, text: string, kind: CustomEffect['kind'] = 'feature'): CustomEffect {
  return { id: newId(), name, kind, source, description: text, activation: 'passive', active: true, uses: null, modifiers: [], triggers: [], duration: { type: 'permanent' } }
}

const USES_COLUMN: Record<string, string> = { rage: 'Rages', 'channel divinity': 'Channel Divinity', 'wild shape': 'Wild Shape', 'second wind': 'Second Wind', 'bardic inspiration': 'Bardic Die', 'sorcery points': 'Sorcery Points', 'font of magic': 'Sorcery Points' }

// Returns a new character with the level applied, and a list of what changed.
export function applyLevelUp(character: CharacterFile, plan: LevelUpPlan, choices: LevelUpChoices, cls: ClassData): { character: CharacterFile; changes: string[] } {
  const c: CharacterFile = JSON.parse(JSON.stringify(character))
  const changes: string[] = []
  const row = cls.progression.find((r) => r.level === plan.newClassLevel)

  // Class entry and level record
  let entry = c.manualValues.classes.find((x) => x.name.toLowerCase() === plan.className.toLowerCase() && x.level > 0)
  if (!entry) {
    entry = { name: plan.className, subclass: '', level: 0, hitDie: plan.hitDie }
    if (c.manualValues.classes.length === 1 && c.manualValues.classes[0].level === 0) c.manualValues.classes[0] = entry
    else c.manualValues.classes.push(entry)
  }
  entry.level = plan.newClassLevel
  entry.hitDie = plan.hitDie

  // Hit points: average or roll, plus Constitution modifier, at least 1.
  const base = choices.hp.method === 'average' ? plan.averageHp : choices.hp.value
  const gain = Math.max(1, base + mod(c, 'con'))
  c.manualValues.maxHp = (c.manualValues.maxHp ?? 0) + gain
  c.state.hpCurrent += gain
  changes.push(`Hit points +${gain} (${choices.hp.method === 'average' ? 'average' : 'rolled'} ${base} + Con ${mod(c, 'con')}), maximum ${c.manualValues.maxHp}`)

  c.manualValues.proficiencyBonus = plan.proficiencyBonus
  changes.push(`${plan.className} level ${plan.newClassLevel}, character level ${plan.newTotalLevel}, proficiency bonus +${plan.proficiencyBonus}`)
  if (plan.slots) {
    c.spellcasting.slotsMax = plan.slots
    changes.push(`Spell slots: ${plan.slots.filter((n) => n > 0).join('/') || 'none'}`)
  }

  // Features of this level
  const source = (lvl: number) => `${plan.className} ${lvl} (2024)`
  for (const f of plan.features) {
    const col = USES_COLUMN[f.name.toLowerCase()]
    const max = col && row ? row.columns[col] : null
    const effect = featEffect(f.name, source(f.level), f.text)
    if (typeof max === 'number') effect.uses = { max, used: 0, resetOn: 'long' }
    c.customEffects.push(effect)
    changes.push(`New feature: ${f.name}`)
  }
  // Existing counters that grow with the class table (Rages, Channel Divinity, ...)
  for (const e of c.customEffects) {
    const col = USES_COLUMN[e.name.toLowerCase()]
    const max = col && row ? row.columns[col] : null
    if (e.uses && e.source.startsWith(plan.className) && typeof max === 'number' && max !== e.uses.max) {
      changes.push(`${e.name} uses ${e.uses.max} to ${max}`)
      e.uses.max = max
    }
  }

  for (const req of plan.requirements) {
    if (req.kind === 'subclass') {
      const sub = req.options.find((s) => s.id === choices.picks[req.id]?.[0])
      if (sub) {
        entry.subclass = sub.name
        for (const f of sub.features.filter((x) => x.level <= plan.newClassLevel)) {
          c.customEffects.push(featEffect(f.name, `${sub.name} ${f.level} (${sub.ruleset}${sub.ruleset === '2014' ? ', legacy' : ''})`, f.text))
        }
        changes.push(`Subclass: ${sub.name}${sub.ruleset === '2014' ? ' (legacy; features before level 3 are granted at level 3)' : ''}`)
      }
    } else if (req.kind === 'asiOrFeat') {
      const a = choices.asi[req.id]
      if (a?.mode === 'feat') {
        const feat = req.feats.find((f) => f.id === a.feat)
        if (feat) {
          c.customEffects.push(featEffect(feat.name, `Feat (${feat.book})`, feat.text, 'feature'))
          changes.push(`Feat: ${feat.name}`)
        }
      } else if (a) {
        const bonus = a.abilities.length === 1 ? 2 : 1
        for (const ability of a.abilities) {
          c.abilityScores[ability] = Math.min(MAX_ABILITY_SCORE, c.abilityScores[ability] + bonus)
        }
        changes.push(`Ability scores: ${a.abilities.map((x) => `${x.toUpperCase()} +${bonus}`).join(', ')} (max ${MAX_ABILITY_SCORE})`)
      }
    } else if (req.kind === 'spells') {
      for (const id of choices.picks[req.id] ?? []) {
        const spell = req.options.find((s) => s.id === id)
        if (!spell) continue
        const entryS: SpellEntry = { id: newId(), spellId: spell.id, name: spell.name, level: spell.level ?? 1, prepared: true, notes: '', details: detailsFromSpell(spell) }
        c.spells.push(entryS)
        changes.push(`Spell: ${spell.name}`)
      }
    } else if (req.kind === 'expertise') {
      for (const id of choices.picks[req.id] ?? []) {
        c.proficiencies.skills[id] = 'expertise'
        changes.push(`Expertise: ${req.options.find((o) => o.id === id)?.name ?? id}`)
      }
    } else if (req.kind === 'weaponMastery') {
      const picked = choices.picks[req.id] ?? []
      if (picked.length) {
        c.customEffects.push(featEffect('Weapon Mastery choice', source(plan.newClassLevel), `Mastery weapons added at ${plan.className} ${plan.newClassLevel}: ${picked.join(', ')}`))
        changes.push(`Weapon Mastery: ${picked.join(', ')}`)
      }
    } else if (req.kind === 'note') {
      const text = (choices.notes[req.id] ?? '').trim()
      if (text) {
        c.customEffects.push(featEffect(req.prompt.split(':')[0], source(plan.newClassLevel), `Choice: ${text}`))
        changes.push(`${req.prompt.split(':')[0]}: ${text}`)
      }
    }
  }

  c.levels.push({ classId: plan.classId, classLevel: plan.newClassLevel, hp: { method: choices.hp.method === 'average' ? 'average' : choices.hp.method === 'rolled' ? 'rolled' : 'manual', value: base }, choices: { ...choices.picks } })
  return { character: c, changes }
}
