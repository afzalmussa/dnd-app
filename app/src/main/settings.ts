// App settings, stored as settings.json in the Windows app data folder
// (%APPDATA%\DnD Character Manager). Milestone 5 adds a way to change the
// save folder from the app; for now the default is used unless the file says otherwise.

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface Settings {
  saveFolder: string
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function defaults(): Settings {
  return { saveFolder: join(app.getPath('userData'), 'characters') }
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
