// Reads the generated data pack (JSON made by tools/book_import). The app ships no book
// content: the data pack lives next to the project in development, or in the app's
// resources folder in a build, and is simply missing if the import was never run.

import { app } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ItemInfo } from '../shared/api'
import { parsePounds } from '../shared/rules/carrying'

function dataPackFolder(): string | null {
  const candidates = [join(app.getAppPath(), '..', 'data-pack'), join(process.resourcesPath ?? '', 'data-pack')]
  return candidates.find((folder) => existsSync(folder)) ?? null
}

interface RawItem {
  id: string
  name: string
  category: string
  weight: string | null
  cost: string | null
  source: { book: string; ruleset: string }
}

export function listItems(): ItemInfo[] {
  const folder = dataPackFolder()
  if (!folder) return []
  const items: ItemInfo[] = []
  for (const book of readdirSync(folder, { withFileTypes: true })) {
    const file = join(folder, book.name, 'items.json')
    if (!book.isDirectory() || !existsSync(file)) continue
    try {
      for (const raw of JSON.parse(readFileSync(file, 'utf-8')) as RawItem[]) {
        items.push({
          id: raw.id,
          name: raw.name,
          category: raw.category,
          weight: parsePounds(raw.weight),
          cost: raw.cost,
          book: raw.source.book,
          ruleset: raw.source.ruleset
        })
      }
    } catch {
      // An unreadable file just means those items are missing from the list.
    }
  }
  return items
}
