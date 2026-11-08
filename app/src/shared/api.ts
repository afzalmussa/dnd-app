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
  mastery: string | null // weapon mastery property, for weapons
  rarity: string | null // magic items
  attunement: boolean // magic items that need attunement
  cost: string | null
  book: string
  ruleset: string
}

// A spell from the imported data pack.
export interface SpellInfo {
  id: string
  name: string
  level: number | null
  school: string | null
  castingTime: string | null
  range: string | null
  components: { v: boolean; s: boolean; m: boolean; material: string | null } | null
  duration: string | null
  concentration: boolean
  ritual: boolean
  classLists: string[]
  text: string
  higherLevels: string | null
  book: string
  ruleset: string
}

// A feat from the imported data pack.
export interface FeatInfo {
  id: string
  name: string
  category: string
  prerequisite: string | null
  text: string
  supersededBy: string | null
  book: string
  ruleset: string
}

export type ContentKind = 'spell' | 'feat' | 'item' | 'class' | 'subclass' | 'species' | 'background' | 'monster'
export type ContentOrigin = 'book' | 'edited' | 'user'

export type FolderKey = 'saveFolder' | 'contentFolder' | 'dmFolder' | 'notesFolder' | 'partyWikiFolder' | 'privateFolder' | 'audioFolder' | 'backupFolder'

export interface BackupSummary {
  file: string
  files: number
  bytes: number
  removed: number // older backups deleted to keep the newest 15
  at: string
}

export interface MusicState {
  position: number // seconds
  duration: number // seconds; 0 while unknown (a live stream)
  paused: boolean
  ad: boolean // YouTube is playing an advert, which cannot be skipped over
  title: string
}

export interface MusicControl {
  action: 'pause' | 'resume' | 'seek' | 'volume' | 'stop'
  value?: number
}

export interface SoundInfo {
  id: string
  name: string
  category: string
  group: string // the pack (sub-folder) the sound came from
  loop: boolean
  credit: string | null
  url: string
}

export interface AppSettings {
  saveFolder: string
  contentFolder: string
  role: 'player' | 'dm'
  dmFolder: string
  notesFolder: string
  partyWikiFolder: string
  privateFolder: string
  playerFolders: Record<string, string>
  audioFolder: string
  backupFolder: string // empty until chosen
  lastBackup: string | null
  activeCampaign: string
  campaigns: { id: string; name: string }[]
}

export interface PublishSummary {
  pages: number // pages that had something to share
  shared: number // shared parts written to the Party Wiki
  secrets: Record<string, number> // secret parts written, per player
  warnings: string[]
}

export interface WikiTreeNode {
  name: string
  path: string // inside its area, with "/" between folders; files end in .md
  type: 'file' | 'folder'
  children?: WikiTreeNode[]
}
export interface WikiPage { content: string; modified: number }
export type WriteResult = { ok: true; modified: number } | { ok: false; conflict: true; theirs: string; modified: number }
export type WikiArea = 'notes' | 'party' | 'private'

// The DM's in-game clock, shared through campaign.json in the save folder.
export interface Campaign {
  gameMinutes: number
}

export interface AppApi {
  // Monsters from the Monster Manual (and your own), for the DM's encounter tools.
  listMonsters(): Promise<Record<string, any>[]>
  runBackup(): Promise<BackupSummary>
  musicPlay(url: string, volume: number): Promise<void>
  musicState(): Promise<MusicState | null>
  musicControl(control: MusicControl): Promise<void>
  campaignId: string // the campaign this window opened with; switching reloads the window
  createCampaign(name: string): Promise<AppSettings>
  switchCampaign(id: string): Promise<AppSettings>
  renameCampaign(id: string, name: string): Promise<AppSettings>
  deleteCampaign(id: string): Promise<AppSettings>
  listSounds(): Promise<SoundInfo[]>
  youtubeTitle(url: string): Promise<string | null>
  getSettings(): Promise<AppSettings>
  // Opens a folder picker. Returns the new settings, or null if cancelled.
  chooseFolder(which: FolderKey): Promise<AppSettings | null>
  // DM: publish the shared and secret parts of notes. Only the DM's PC can do this.
  wikiPublish(scope: 'all' | 'page', path?: string): Promise<PublishSummary>
  // DM: pick the private folder for one player (a Drive folder shared with that player only).
  setPlayerFolder(player: string): Promise<AppSettings | null>
  removePlayerFolder(player: string): Promise<AppSettings>
  // Wiki. Paths are relative to the area's folder. Nothing outside the two folders can be touched.
  wikiTree(area: WikiArea): Promise<WikiTreeNode[] | null>
  wikiRead(area: WikiArea, path: string): Promise<WikiPage>
  wikiWrite(area: WikiArea, path: string, content: string, expectedModified: number | null, overwrite: boolean): Promise<WriteResult>
  wikiSaveCopy(area: WikiArea, path: string, content: string): Promise<string>
  wikiCreatePage(area: WikiArea, path: string, content?: string): Promise<void>
  wikiCreateFolder(area: WikiArea, path: string): Promise<void>
  wikiRename(area: WikiArea, path: string, newPath: string): Promise<string[]>
  wikiTrash(area: WikiArea, path: string): Promise<void>
  wikiPages(area: WikiArea): Promise<{ path: string; text: string }[]>
  onWikiChanged(callback: (area: WikiArea) => void): () => void
  setRole(role: 'player' | 'dm'): Promise<AppSettings>
  getCampaign(): Promise<Campaign | null>
  setCampaign(campaign: Campaign): Promise<void>
  // Reads every character file in the DM folder. Never writes to it.
  listParty(): Promise<import('./rules/party').PartyMember[]>
  // Book entries merged with your corrections and homebrew (each has `_origin`).
  listContent(kind: ContentKind): Promise<Record<string, any>[]>
  saveContent(kind: ContentKind, entry: Record<string, any>): Promise<void>
  // Removes your version; a book entry comes back, homebrew is deleted.
  deleteContent(kind: ContentKind, id: string): Promise<void>
  listFeats(): Promise<FeatInfo[]>
  getClassData(): Promise<{ classes: unknown[]; subclasses: unknown[]; multiclass: unknown }>
  listSpells(): Promise<SpellInfo[]>
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
