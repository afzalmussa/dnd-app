// Backs up this PC's characters, corrections and notes into one zip in a folder you choose
// (normally a Google Drive folder). The newest 15 backups are kept. To restore, unzip a backup and copy
// the folders back to where Settings says they live.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BackupSummary } from '../shared/api'
import { loadSettings, saveSettings } from './settings'
import { buildZip, type ZipEntry } from './zip'

const KEEP = 15
const PREFIX = 'DnD-backup-'

function collect(dir: string, into: string, out: ZipEntry[]): void {
  if (!existsSync(dir)) return
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) collect(full, `${into}/${e.name}`, out)
    else if (e.isFile()) out.push({ name: `${into}/${e.name}`, data: readFileSync(full), modified: statSync(full).mtime })
  }
}

export function runBackup(): BackupSummary {
  const s = loadSettings()
  if (!s.backupFolder) throw new Error('Choose a backup folder first (Settings).')
  const entries: ZipEntry[] = []
  collect(s.saveFolder, 'characters', entries)
  collect(s.contentFolder, 'user-content', entries)
  collect(s.notesFolder, 'notes', entries)
  mkdirSync(s.backupFolder, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')
  const file = join(s.backupFolder, `${PREFIX}${stamp}.zip`)
  const zip = buildZip(entries)
  writeFileSync(`${file}.tmp`, zip)
  renameSync(`${file}.tmp`, file) // a half-written backup never has the real name
  const old = readdirSync(s.backupFolder).filter((n) => n.startsWith(PREFIX) && n.endsWith('.zip')).sort().reverse().slice(KEEP)
  for (const n of old) unlinkSync(join(s.backupFolder, n))
  const at = new Date().toISOString()
  saveSettings({ lastBackup: at })
  return { file, files: entries.length, bytes: zip.length, removed: old.length, at }
}

// Once a day, when the app opens, if a backup folder is set. A failure is not shown: the Settings button reports problems.
export function backupIfDue(): void {
  const s = loadSettings()
  if (!s.backupFolder) return
  const last = s.lastBackup ? Date.parse(s.lastBackup) : 0
  if (Date.now() - last < 20 * 3600 * 1000) return
  try {
    runBackup()
  } catch {
    // try again next time the app opens
  }
}
