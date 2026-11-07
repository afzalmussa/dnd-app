// Electron main process: opens the window and answers the UI's requests
// for file access (see src/shared/api.ts for the list).

import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { fileNameFor } from '../shared/character'
import type { CharacterFile } from '../shared/schema/character'
import {
  deleteCharacter,
  importCharacterFrom,
  listCharacters,
  loadCharacter,
  saveCharacter,
  writeCharacterFile
} from './characterFiles'
import { getClassData, listFeats, listItems, listSpells } from './dataPack'
import { getSaveFolder } from './settings'

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1200,
    minHeight: 700,
    title: 'DnD Character Manager',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The page gets no direct Node.js access; it can only call the
      // functions the preload script exposes.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // The only extra window the app opens is the popped-out roll log, which is a
  // blank window the page draws into. Any other new-window request is refused.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url === '') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          title: 'Roll Log',
          autoHideMenuBar: true,
          backgroundColor: '#110d0e',
          minWidth: 320,
          minHeight: 200
        }
      }
    }
    return { action: 'deny' }
  })

  // In development electron-vite serves the UI with live reload; in a build
  // it is a plain HTML file next to this script.
  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

function registerHandlers(): void {
  ipcMain.handle('listItems', () => listItems())
  ipcMain.handle('listFeats', () => listFeats())
  ipcMain.handle('getClassData', () => getClassData())
  ipcMain.handle('listSpells', () => listSpells())
  ipcMain.handle('getSaveFolder', () => getSaveFolder())
  ipcMain.handle('listCharacters', () => listCharacters())
  ipcMain.handle('loadCharacter', (_event, fileName: string) => loadCharacter(fileName))
  ipcMain.handle('saveCharacter', (_event, character: CharacterFile, previous: string | null) =>
    saveCharacter(character, previous)
  )
  ipcMain.handle('deleteCharacter', (_event, fileName: string) => deleteCharacter(fileName))

  ipcMain.handle('exportCharacter', async (event, character: CharacterFile) => {
    const window = BrowserWindow.fromWebContents(event.sender)!
    const result = await dialog.showSaveDialog(window, {
      title: 'Export character',
      defaultPath: fileNameFor(character),
      filters: [{ name: 'Character file', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    writeCharacterFile(result.filePath, character)
    return result.filePath
  })

  ipcMain.handle('importCharacter', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)!
    const result = await dialog.showOpenDialog(window, {
      title: 'Import character',
      properties: ['openFile'],
      filters: [{ name: 'Character file', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return importCharacterFrom(result.filePaths[0])
  })
}

app.whenReady().then(() => {
  registerHandlers()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
