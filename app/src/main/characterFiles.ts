// Reading and writing character JSON files in the save folder.

import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileNameFor, normalizeCharacter } from '../shared/character'
import type { CharacterListEntry, LoadResult } from '../shared/api'
import { classLabel } from '../shared/rules/summary'
import type { CharacterFile } from '../shared/schema/character'
import { getSaveFolder } from './settings'

// Only plain file names are accepted from the UI, never paths, so nothing
// outside the save folder can be read or overwritten.
function pathInSaveFolder(fileName: string): string {
  if (basename(fileName) !== fileName || !fileName.endsWith('.json')) {
    throw new Error(`Not a character file name: ${fileName}`)
  }
  return join(getSaveFolder(), fileName)
}

export function readCharacterFile(path: string): LoadResult {
  try {
    const character = normalizeCharacter(JSON.parse(readFileSync(path, 'utf8')))
    return { ok: true, character }
  } catch (error) {
    const reason = error instanceof SyntaxError ? 'The file is not valid JSON.' : (error as Error).message
    return { ok: false, error: reason }
  }
}

export function listCharacters(): CharacterListEntry[] {
  const folder = getSaveFolder()
  return readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((fileName) => {
      const result = readCharacterFile(join(folder, fileName))
      return result.ok
        ? { fileName, name: result.character.name, summary: classLabel(result.character), readable: true }
        : { fileName, name: fileName, summary: result.error, readable: false }
    })
}

export function loadCharacter(fileName: string): LoadResult {
  return readCharacterFile(pathInSaveFolder(fileName))
}

// Writes to a temporary file first and then renames it, so a crash halfway
// through a save cannot leave a half-written character file behind.
export function writeCharacterFile(path: string, character: CharacterFile): void {
  const temporary = `${path}.tmp`
  writeFileSync(temporary, JSON.stringify(character, null, 2), 'utf8')
  renameSync(temporary, path)
}

export function saveCharacter(character: CharacterFile, previousFileName: string | null): string {
  const fileName = fileNameFor(character)
  writeCharacterFile(pathInSaveFolder(fileName), character)
  if (previousFileName && previousFileName !== fileName && existsSync(pathInSaveFolder(previousFileName))) {
    rmSync(pathInSaveFolder(previousFileName))
  }
  return fileName
}

export function deleteCharacter(fileName: string): void {
  rmSync(pathInSaveFolder(fileName), { force: true })
}

// Copies an outside file into the save folder. If a file with that name is
// already there (for example the same character imported twice), the copy
// gets "-imported-2" and so on, so nothing is overwritten.
export function importCharacterFrom(path: string): { fileName: string } | { error: string } {
  const result = readCharacterFile(path)
  if (!result.ok) return { error: result.error }
  const base = fileNameFor(result.character).replace(/\.json$/, '')
  let fileName = `${base}.json`
  for (let n = 2; existsSync(pathInSaveFolder(fileName)); n++) {
    fileName = `${base}-imported-${n}.json`
  }
  writeCharacterFile(pathInSaveFolder(fileName), result.character)
  return { fileName }
}
