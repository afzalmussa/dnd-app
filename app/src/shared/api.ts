// The functions the user interface can call in the main process.
// src/preload/index.ts provides these; src/main/index.ts answers them.
// Keeping the list here means both sides agree on names and types.

import type { CharacterFile } from './schema/character'

export interface CharacterListEntry {
  fileName: string
  name: string
  summary: string // class and level, or the error if the file is unreadable
  readable: boolean
}

export type LoadResult = { ok: true; character: CharacterFile } | { ok: false; error: string }

// An item from the imported data pack (weapons, armor, tools, gear).
export interface ItemInfo {
  id: string
  name: string
  category: string
  weight: number | null // pounds; null when the book gives none or "Varies"
  cost: string | null
  book: string
  ruleset: string
}

export interface AppApi {
  listItems(): Promise<ItemInfo[]>
  getSaveFolder(): Promise<string>
  listCharacters(): Promise<CharacterListEntry[]>
  loadCharacter(fileName: string): Promise<LoadResult>
  // Writes the character and returns the file name used. If the name changed,
  // the old file is removed so there is still one file per character.
  saveCharacter(character: CharacterFile, previousFileName: string | null): Promise<string>
  deleteCharacter(fileName: string): Promise<void>
  // Both open a Windows file dialog. They return null if the user cancels.
  exportCharacter(character: CharacterFile): Promise<string | null>
  importCharacter(): Promise<{ fileName: string; copied: boolean } | { error: string } | null>
}
