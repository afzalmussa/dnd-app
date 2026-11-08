// App settings, stored as settings.json in the Windows app data folder.
//
// Settings are in two groups. Per campaign: the folders for characters, notes, the party wiki, secrets,
// the DM's sheets and backups, and the players' secret folders. For the whole app: the role, the
// content folder (homebrew is shared by every campaign) and the sound library. Everything else in the
// app calls loadSettings() and gets one flat object with the active campaign's folders merged in, so it
// does not need to know about campaigns.

import { app } from 'electron'
import { PLAYER_EDITION } from './edition'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface CampaignSettings {
  saveFolder: string // where this PC's characters are saved; can be a shared Drive folder
  dmFolder: string // the folder of party sheets the DM view reads (read-only)
  notesFolder: string // My Notes: private notes
  partyWikiFolder: string // Party Wiki: shared pages (empty until chosen)
  privateFolder: string // "From the DM": a folder only this player can see, where the DM publishes their secrets
  playerFolders: Record<string, string> // DM only: player name -> that player's private folder
  backupFolder: string // where backup zips go (empty until chosen)
  lastBackup: string | null
}

export interface Settings extends CampaignSettings {
  contentFolder: string // corrections and homebrew; can be a shared folder
  role: 'player' | 'dm'
  audioFolder: string // DM only: the sound library
  activeCampaign: string
  campaigns: { id: string; name: string }[]
}

interface Stored {
  contentFolder: string
  role: 'player' | 'dm'
  audioFolder: string
  activeCampaign: string
  campaigns: Record<string, CampaignSettings & { name: string }>
}

const CAMPAIGN_KEYS: (keyof CampaignSettings)[] = ['saveFolder', 'dmFolder', 'notesFolder', 'partyWikiFolder', 'privateFolder', 'playerFolders', 'backupFolder', 'lastBackup']

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

// While developing, sounds fetched into <project>/audio are found without any setting.
function devAudioFolder(): string | null {
  const folder = join(app.getAppPath(), '..', 'audio')
  return existsSync(folder) ? folder : null
}

// The first campaign keeps the folders the app has always used; later ones get their own folders.
function newCampaign(name: string, id: string, first: boolean): CampaignSettings & { name: string } {
  const base = first ? app.getPath('userData') : join(app.getPath('userData'), 'campaigns', id)
  const saveFolder = join(base, 'characters')
  return { name, saveFolder, dmFolder: saveFolder, notesFolder: join(base, 'notes'), partyWikiFolder: '', privateFolder: '', playerFolders: {}, backupFolder: '', lastBackup: null }
}

function defaults(): Stored {
  return {
    contentFolder: join(app.getPath('userData'), 'user-content'), role: 'player', audioFolder: devAudioFolder() ?? join(app.getPath('userData'), 'audio'),
    activeCampaign: 'main', campaigns: { main: newCampaign('My campaign', 'main', true) }
  }
}

function readStored(): Stored {
  const path = settingsPath()
  if (!existsSync(path)) return defaults()
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const base = defaults()
    if (raw.campaigns && typeof raw.campaigns === 'object' && Object.keys(raw.campaigns).length > 0) {
      const campaigns: Stored['campaigns'] = {}
      for (const [id, c] of Object.entries<any>(raw.campaigns)) campaigns[id] = { ...newCampaign(c.name ?? id, id, false), ...c }
      const active = campaigns[raw.activeCampaign] ? raw.activeCampaign : Object.keys(campaigns)[0]
      return { ...base, ...raw, campaigns, activeCampaign: active }
    }
    // An older settings file with the folders at the top: they become the first campaign.
    const first = { ...newCampaign('My campaign', 'main', true) }
    for (const key of CAMPAIGN_KEYS) if (raw[key] !== undefined) (first as any)[key] = raw[key]
    return { ...base, contentFolder: raw.contentFolder ?? base.contentFolder, role: raw.role ?? base.role, audioFolder: raw.audioFolder ?? base.audioFolder, campaigns: { main: first }, activeCampaign: 'main' }
  } catch {
    // A damaged settings file should not stop the app from starting.
    return defaults()
  }
}

function write(stored: Stored): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(settingsPath(), JSON.stringify(stored, null, 2), 'utf8')
}

export function loadSettings(): Settings {
  const s = readStored()
  const { name: _name, ...campaign } = s.campaigns[s.activeCampaign]
  const merged: Settings = {
    ...campaign, contentFolder: s.contentFolder, role: PLAYER_EDITION ? 'player' : s.role, audioFolder: s.audioFolder,
    activeCampaign: s.activeCampaign, campaigns: Object.entries(s.campaigns).map(([id, c]) => ({ id, name: c.name }))
  }
  return merged
}

export function getSaveFolder(): string {
  const folder = loadSettings().saveFolder
  mkdirSync(folder, { recursive: true })
  return folder
}

// Campaign folders go to the active campaign; the rest are app-wide.
export function saveSettings(change: Partial<Omit<Settings, 'campaigns' | 'activeCampaign'>>): Settings {
  const s = readStored()
  for (const [key, value] of Object.entries(change)) {
    if ((CAMPAIGN_KEYS as string[]).includes(key)) (s.campaigns[s.activeCampaign] as any)[key] = value
    else (s as any)[key] = value
  }
  write(s)
  return loadSettings()
}

export function createCampaign(name: string): Settings {
  const s = readStored()
  const id = `c${Date.now().toString(36)}`
  s.campaigns[id] = newCampaign(name.trim() || 'New campaign', id, false)
  s.activeCampaign = id
  write(s)
  return loadSettings()
}

export function switchCampaign(id: string): Settings {
  const s = readStored()
  if (!s.campaigns[id]) throw new Error('No such campaign.')
  s.activeCampaign = id
  write(s)
  return loadSettings()
}

export function renameCampaign(id: string, name: string): Settings {
  const s = readStored()
  if (!s.campaigns[id] || !name.trim()) throw new Error('Give the campaign a name.')
  s.campaigns[id].name = name.trim()
  write(s)
  return loadSettings()
}

// Forgets the campaign's settings. Its files are not touched.
export function deleteCampaign(id: string): Settings {
  const s = readStored()
  if (Object.keys(s.campaigns).length < 2) throw new Error('You need at least one campaign.')
  delete s.campaigns[id]
  if (s.activeCampaign === id) s.activeCampaign = Object.keys(s.campaigns)[0]
  write(s)
  return loadSettings()
}

export function activeCampaignId(): string {
  return readStored().activeCampaign
}
