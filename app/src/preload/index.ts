// The bridge between the UI and the main process. It exposes exactly the
// functions listed in src/shared/api.ts as `window.api`, and nothing else.

import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi } from '../shared/api'

const api: AppApi = {
  getSaveFolder: () => ipcRenderer.invoke('getSaveFolder'),
  listCharacters: () => ipcRenderer.invoke('listCharacters'),
  loadCharacter: (fileName) => ipcRenderer.invoke('loadCharacter', fileName),
  saveCharacter: (character, previousFileName) => ipcRenderer.invoke('saveCharacter', character, previousFileName),
  deleteCharacter: (fileName) => ipcRenderer.invoke('deleteCharacter', fileName),
  exportCharacter: (character) => ipcRenderer.invoke('exportCharacter', character),
  importCharacter: () => ipcRenderer.invoke('importCharacter')
}

contextBridge.exposeInMainWorld('api', api)
