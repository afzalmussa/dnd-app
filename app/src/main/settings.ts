// App settings, stored as settings.json in the Windows app data folder
// (%APPDATA%\DnD Character Manager). Milestone 5 adds a way to change the
// save folder from the app; for now the default is used unless the file says otherwise.

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Settings {
  saveFolder: string // where this PC's characters are saved; can be a shared Drive folder
  contentFolder: string // corrections and homebrew; can be a shared folder
  role: 'player' | 'dm'
  dmFolder: string // the folder of party sheets the DM view reads (read-only)
  notesFolder: string // My Notes: private notes
  partyWikiFolder: string // Party Wiki: shared pages (empty until chosen)
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function defaults(): Settings {
  const saveFolder = join(app.getPath('userData'), 'characters')
  return { saveFolder, contentFolder: join(app.getPath('userData'), 'user-content'), role: 'player', dmFolder: saveFolder, notesFolder: join(app.getPath('userData'), 'notes'), partyWikiFolder: '' }
}

export function loadSettings(): Settings {
  const path = settingsPath()
  if (!existsSync(path)) return defaults()
  try {
    return { ...defaults(), ...JSON.parse(readFileSync(path, 'utf8')) }
  } catch {
    // A damaged settings file should not stop the app from starting.
    return defaults()
  }
}

export function getSaveFolder(): string {
  const folder = loadSettings().saveFolder
  mkdirSync(folder, { recursive: true })
  return folder
}

export function saveSettings(change: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...change }
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}
