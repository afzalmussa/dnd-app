// Reads the generated data pack (JSON made by tools/book_import). The app ships no book
// content: the data pack lives next to the project in development, or in the app's
// resources folder in a build, and is simply missing if the import was never run.

import { app } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FeatInfo, ItemInfo, SpellInfo } from '../shared/api'
import { parsePounds } from '../shared/rules/carrying'
import { mergeEntries } from '../shared/rules/contentMerge'
import { loadUserEntries, PACK_FILE, type ContentKind } from './userContent'

function dataPackFolder(): string | null {
  const candidates = [join(app.getAppPath(), '..', 'data-pack'), join(process.resourcesPath ?? '', 'data-pack')]
  return candidates.find((folder) => existsSync(folder)) ?? null
}

interface RawItem {
  id: string
  name: string
  category: string
  weight: string | null
  weapon?: { mastery: string | null }
  cost: string | null
  source: { book: string; ruleset: string }
}

export function listItems(): ItemInfo[] {
  return mergedContent('item').map((raw: RawItem & { weapon?: { mastery: string | null }; magic?: { rarity: string }; attunement?: boolean }) => ({
    id: raw.id,
    name: raw.name,
    category: raw.category,
    weight: parsePounds(raw.weight),
    mastery: raw.weapon?.mastery ?? null,
    rarity: raw.magic?.rarity ?? null,
    attunement: !!raw.attunement,
    cost: raw.cost,
    book: raw.source.book,
    ruleset: raw.source.ruleset
  }))
}

export function listSpells(): SpellInfo[] {
  return mergedContent('spell').map((raw) => ({
    id: raw.id, name: raw.name, level: raw.level, school: raw.school, castingTime: raw.castingTime, range: raw.range,
    components: raw.components, duration: raw.duration, concentration: !!raw.concentration, ritual: !!raw.ritual,
    classLists: raw.classLists ?? [], text: raw.text ?? '', higherLevels: raw.higherLevels ?? null,
    book: raw.source.book, ruleset: raw.source.ruleset
  }))
}

export function listFeats(): FeatInfo[] {
  return mergedContent('feat').map((f) => ({
    id: f.id, name: f.name, category: f.category, prerequisite: f.prerequisite?.printed ?? null,
    text: f.text ?? '', supersededBy: f.supersededBy ?? null, book: f.source.book, ruleset: f.source.ruleset
  }))
}

// Classes and subclasses with the fields the level-up wizard uses.
export function getClassData(): { classes: unknown[]; subclasses: unknown[]; multiclass: unknown } {
  const classes = mergedContent('class').map((c) => ({
    id: c.id, name: c.name, hitDie: c.hitDie, subclassLevel: c.subclassLevel, spellcasting: c.spellcasting,
    primaryAbilities: c.primaryAbilities, primaryOr: / or /i.test(c.traitBoxPrinted?.['Primary Ability'] ?? ''),
    progression: c.progression,
    features: c.features.map((f: any) => ({ id: f.id, name: f.name, level: f.level, text: f.text }))
  }))
  const subclasses = mergedContent('subclass').map((s) => ({
    id: s.id, name: s.name, classId: s.classId, ruleset: s.source.ruleset, book: s.source.book,
    features: s.features.map((f: any) => ({ id: f.id, name: f.name, level: f.level, printedLevel: f.printedLevel, text: f.text }))
  }))
  let multiclass: unknown = null
  const folder = dataPackFolder()
  const mcFile = folder ? join(folder, 'phb24', 'multiclassing.json') : ''
  if (mcFile && existsSync(mcFile)) {
    try {
      multiclass = JSON.parse(readFileSync(mcFile, 'utf-8'))
    } catch {
      multiclass = null
    }
  }
  return { classes, subclasses, multiclass }
}

// Book entries with your corrections and homebrew merged in. Each entry gets `_origin`:
// "book", "edited" (yours replaces a book entry with the same id) or "user" (homebrew).
export function mergedContent(kind: ContentKind): any[] {
  const folder = dataPackFolder()
  const book: any[] = []
  if (folder) {
    for (const dir of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, dir.name, PACK_FILE[kind])
      if (!dir.isDirectory() || !existsSync(path)) continue
      try {
        book.push(...JSON.parse(readFileSync(path, 'utf-8')))
      } catch {
        // skip an unreadable file
      }
    }
  }
  return mergeEntries(book, loadUserEntries(kind))
}
