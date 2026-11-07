// Your own content: corrections to imported entries and homebrew, saved as separate files in the
// content folder (default: %APPDATA%\DnD Character Manager\user-content). The imported data pack is
// never written to. An entry here with the same id as an imported one replaces it ("edited"); a new
// id adds an entry ("homebrew"). Point the content folder at a shared Drive folder to share it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadSettings } from './settings'

export const CONTENT_KINDS = ['spell', 'feat', 'item', 'class', 'subclass', 'species', 'background'] as const
export type ContentKind = (typeof CONTENT_KINDS)[number]

export const PACK_FILE: Record<ContentKind, string> = {
  spell: 'spells.json', feat: 'feats.json', item: 'items.json', class: 'classes.json',
  subclass: 'subclasses.json', species: 'species.json', background: 'backgrounds.json'
}

function folder(): string {
  const dir = loadSettings().contentFolder
  mkdirSync(dir, { recursive: true })
  return dir
}

function fileFor(kind: ContentKind): string {
  if (!CONTENT_KINDS.includes(kind)) throw new Error(`Unknown content kind: ${kind}`)
  return join(folder(), PACK_FILE[kind])
}

export function loadUserEntries(kind: ContentKind): any[] {
  const file = fileFor(kind)
  if (!existsSync(file)) return []
  try {
    const data = JSON.parse(readFileSync(file, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return [] // a damaged file should not stop the app; the editor shows only the book entries
  }
}

export function saveUserEntry(kind: ContentKind, entry: { id: string }): void {
  if (!entry.id || typeof entry.id !== 'string') throw new Error('The entry needs an id.')
  const entries = loadUserEntries(kind).filter((e) => e.id !== entry.id)
  entries.push(entry)
  writeFileSync(fileFor(kind), JSON.stringify(entries, null, 1), 'utf-8')
}

export function deleteUserEntry(kind: ContentKind, id: string): void {
  writeFileSync(fileFor(kind), JSON.stringify(loadUserEntries(kind).filter((e) => e.id !== id), null, 1), 'utf-8')
}
