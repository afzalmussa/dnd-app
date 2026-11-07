// The bridge between the UI and the main process. It exposes exactly the
// functions listed in src/shared/api.ts as `window.api`, and nothing else.

import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi } from '../shared/api'

const api: AppApi = {
  wikiTree: (area) => ipcRenderer.invoke('wikiTree', area),
  wikiRead: (area, path) => ipcRenderer.invoke('wikiRead', area, path),
  wikiWrite: (area, path, content, expected, overwrite) => ipcRenderer.invoke('wikiWrite', area, path, content, expected, overwrite),
  wikiSaveCopy: (area, path, content) => ipcRenderer.invoke('wikiSaveCopy', area, path, content),
  wikiCreatePage: (area, path, content) => ipcRenderer.invoke('wikiCreatePage', area, path, content),
  wikiCreateFolder: (area, path) => ipcRenderer.invoke('wikiCreateFolder', area, path),
  wikiRename: (area, path, newPath) => ipcRenderer.invoke('wikiRename', area, path, newPath),
  wikiTrash: (area, path) => ipcRenderer.invoke('wikiTrash', area, path),
  wikiPages: (area) => ipcRenderer.invoke('wikiPages', area),
  onWikiChanged: (callback) => {
    const listener = (_event: unknown, area: 'notes' | 'party') => callback(area)
    ipcRenderer.on('wikiChanged', listener)
    return () => ipcRenderer.removeListener('wikiChanged', listener)
  },
  getSettings: () => ipcRenderer.invoke('getSettings'),
  chooseFolder: (which) => ipcRenderer.invoke('chooseFolder', which),
  setRole: (role) => ipcRenderer.invoke('setRole', role),
  getCampaign: () => ipcRenderer.invoke('getCampaign'),
  setCampaign: (campaign) => ipcRenderer.invoke('setCampaign', campaign),
  listParty: () => ipcRenderer.invoke('listParty'),
  listContent: (kind) => ipcRenderer.invoke('listContent', kind),
  saveContent: (kind, entry) => ipcRenderer.invoke('saveContent', kind, entry),
  deleteContent: (kind, id) => ipcRenderer.invoke('deleteContent', kind, id),
  listFeats: () => ipcRenderer.invoke('listFeats'),
  getClassData: () => ipcRenderer.invoke('getClassData'),
  listSpells: () => ipcRenderer.invoke('listSpells'),
  listItems: () => ipcRenderer.invoke('listItems'),
  getSaveFolder: () => ipcRenderer.invoke('getSaveFolder'),
  listCharacters: () => ipcRenderer.invoke('listCharacters'),
  loadCharacter: (fileName) => ipcRenderer.invoke('loadCharacter', fileName),
  saveCharacter: (character, previousFileName) => ipcRenderer.invoke('saveCharacter', character, previousFileName),
  deleteCharacter: (fileName) => ipcRenderer.invoke('deleteCharacter', fileName),
  exportCharacter: (character) => ipcRenderer.invoke('exportCharacter', character),
  importCharacter: () => ipcRenderer.invoke('importCharacter')
}

contextBridge.exposeInMainWorld('api', api)
