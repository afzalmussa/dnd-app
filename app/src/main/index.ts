// Electron main process: opens the window and answers the UI's requests
// for file access (see src/shared/api.ts for the list).

import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { extname } from 'node:path'
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
import { getClassData, listFeats, listItems, listSpells, mergedContent } from './dataPack'
import { deleteUserEntry, saveUserEntry, type ContentKind } from './userContent'
import { getCampaign, listParty, setCampaign } from './party'
import { getSaveFolder, loadSettings, saveSettings } from './settings'
import { PLAYER_EDITION } from './edition'
import * as wiki from './wikiFiles'
import { publish } from './wikiPublish'

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
  ipcMain.handle('getSettings', () => loadSettings())
  ipcMain.handle('chooseFolder', async (event, which: 'saveFolder' | 'contentFolder' | 'dmFolder' | 'notesFolder' | 'partyWikiFolder' | 'privateFolder') => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const options = { properties: ['openDirectory' as const, 'createDirectory' as const], title: 'Choose a folder' }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    const change: Record<string, string> = { [which]: result.filePaths[0] }
    // The DM view follows the save folder until the DM picks a different one.
    if (which === 'saveFolder' && loadSettings().dmFolder === loadSettings().saveFolder) change.dmFolder = result.filePaths[0]
    const saved = saveSettings(change)
    if (which === 'notesFolder' || which === 'partyWikiFolder' || which === 'privateFolder') {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) wiki.startWatching(win)
    }
    return saved
  })
  ipcMain.handle('setRole', (_e, role: 'player' | 'dm') => saveSettings({ role: PLAYER_EDITION ? 'player' : role }))
  ipcMain.handle('getCampaign', () => getCampaign())
  ipcMain.handle('setCampaign', (_e, campaign: { gameMinutes: number }) => setCampaign(campaign))
  ipcMain.handle('listParty', () => listParty())
  ipcMain.handle('wikiPublish', (_e, scope: 'all' | 'page', path?: string) => publish(scope, path))
  ipcMain.handle('setPlayerFolder', async (event, player: string) => {
    if (loadSettings().role !== 'dm') throw new Error('Only the DM sets player folders.')
    const parent = BrowserWindow.fromWebContents(event.sender)
    const options = { properties: ['openDirectory' as const, 'createDirectory' as const], title: `Private folder for ${player}` }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return saveSettings({ playerFolders: { ...loadSettings().playerFolders, [player]: result.filePaths[0] } })
  })
  ipcMain.handle('removePlayerFolder', (_e, player: string) => {
    const folders = { ...loadSettings().playerFolders }
    delete folders[player]
    return saveSettings({ playerFolders: folders })
  })
  ipcMain.handle('wikiTree', (_e, area) => wiki.listTree(area))
  ipcMain.handle('wikiRead', (_e, area, path) => wiki.readPage(area, path))
  ipcMain.handle('wikiWrite', (_e, area, path, content, expected, overwrite) => wiki.writePage(area, path, content, expected, overwrite))
  ipcMain.handle('wikiSaveCopy', (_e, area, path, content) => wiki.saveCopy(area, path, content))
  ipcMain.handle('wikiCreatePage', (_e, area, path, content) => wiki.createPage(area, path, content))
  ipcMain.handle('wikiCreateFolder', (_e, area, path) => wiki.createFolder(area, path))
  ipcMain.handle('wikiRename', (_e, area, path, newPath) => wiki.renamePage(area, path, newPath))
  ipcMain.handle('wikiTrash', (_e, area, path) => wiki.trashPage(area, path))
  ipcMain.handle('wikiPages', (_e, area) => wiki.allPagesWithText(area))
  ipcMain.handle('listMonsters', () => mergedContent('monster'))
  ipcMain.handle('listItems', () => listItems())
  ipcMain.handle('listContent', (_e, kind: ContentKind) => mergedContent(kind))
  ipcMain.handle('saveContent', (_e, kind: ContentKind, entry: { id: string }) => saveUserEntry(kind, entry))
  ipcMain.handle('deleteContent', (_e, kind: ContentKind, id: string) => deleteUserEntry(kind, id))
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

// Images in wiki pages load through wiki-file://<area>/<path>. Only image files inside the two wiki
// folders are served; the screen's Content Security Policy allows this scheme for images only.
protocol.registerSchemesAsPrivileged([{ scheme: 'wiki-file', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'])

app.whenReady().then(() => {
  protocol.handle('wiki-file', (request) => {
    try {
      const url = new URL(request.url)
      const area = url.hostname === 'party' ? 'party' : url.hostname === 'notes' ? 'notes' : null
      const relative = decodeURIComponent(url.pathname.slice(1))
      if (!area || !IMAGE_TYPES.has(extname(relative).toLowerCase())) return new Response('Not allowed', { status: 403 })
      return net.fetch(pathToFileURL(wiki.safePath(area, relative)).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
  registerHandlers()
  const window = createWindow()
  wiki.startWatching(window)
})

app.on('window-all-closed', () => app.quit())
