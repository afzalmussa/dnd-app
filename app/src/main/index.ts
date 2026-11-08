// Electron main process: opens the window and answers the UI's requests
// for file access (see src/shared/api.ts for the list).

import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import { existsSync } from 'node:fs'
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
import { activeCampaignId, createCampaign, deleteCampaign, getSaveFolder, loadSettings, renameCampaign, saveSettings, switchCampaign } from './settings'
import { APP_NAME, PLAYER_EDITION } from './edition'
import { backupIfDue, runBackup } from './backup'
import { listMusic, listSounds, safeAudioPath, youtubeTitle } from './audio'
import type { FolderKey, MusicControl } from '../shared/api'
import { musicControl, musicState, openYoutubeSignIn, playMusic, stopMusic } from './music'
import * as wiki from './wikiFiles'
import { publish } from './wikiPublish'

// Both apps were called DnD Character Manager before they were renamed; keep using the old data folders so nothing is lost.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', join(app.getPath('appData'), PLAYER_EDITION ? 'DnD Character Manager Players' : 'DnD Character Manager'))

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1200,
    minHeight: 700,
    title: APP_NAME,
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

  window.on('closed', stopMusic) // the hidden music window must not keep the app running

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
  ipcMain.handle('chooseFolder', async (event, which: FolderKey) => {
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
  ipcMain.handle('runBackup', () => runBackup())
  ipcMain.handle('musicPlay', (_e, url: string, volume: number) => playMusic(url, volume))
  ipcMain.handle('musicState', () => musicState())
  ipcMain.handle('youtubeSignIn', () => openYoutubeSignIn())
  ipcMain.handle('listMusic', () => listMusic())
  ipcMain.handle('addMusicFolder', async (event, name: string) => {
    if (PLAYER_EDITION) return null
    const parent = BrowserWindow.fromWebContents(event.sender)
    const options = { properties: ['openDirectory' as const], title: `Choose the ${name} music folder` }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return saveSettings({ musicFolders: [...loadSettings().musicFolders, { name: name.trim() || 'Music', folder: result.filePaths[0] }] })
  })
  ipcMain.handle('removeMusicFolder', (_e, index: number) => saveSettings({ musicFolders: loadSettings().musicFolders.filter((_, i) => i !== index) }))
  ipcMain.handle('musicControl', (_e, control: MusicControl) => musicControl(control))
  ipcMain.on('campaignId', (event) => { event.returnValue = activeCampaignId() })
  // A different campaign means different folders: the window is reloaded by the screen, and the wiki watchers follow the new folders.
  const changedCampaign = (settings: ReturnType<typeof loadSettings>) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) wiki.startWatching(win)
    return settings
  }
  ipcMain.handle('createCampaign', (_e, name: string) => changedCampaign(createCampaign(name)))
  ipcMain.handle('switchCampaign', (_e, id: string) => changedCampaign(switchCampaign(id)))
  ipcMain.handle('renameCampaign', (_e, id: string, name: string) => renameCampaign(id, name))
  ipcMain.handle('deleteCampaign', (_e, id: string) => changedCampaign(deleteCampaign(id)))
  ipcMain.handle('listSounds', () => listSounds())
  ipcMain.handle('youtubeTitle', (_e, url: string) => youtubeTitle(url))
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
protocol.registerSchemesAsPrivileged([
  { scheme: 'wiki-file', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'audio-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])
const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'])

app.whenReady().then(() => {
  protocol.handle('wiki-file', (request) => {
    try {
      const url = new URL(request.url)
      const area = url.hostname === 'party' ? 'party' : url.hostname === 'notes' ? 'notes' : null
      const relative = decodeURIComponent(url.pathname.slice(1))
      if (!area || !IMAGE_TYPES.has(extname(relative).toLowerCase())) return new Response('Not allowed', { status: 403 })
      let file = wiki.safePath(area, relative)
      if (!existsSync(file)) file = wiki.findAttachment(area, relative) ?? file // Obsidian-style: found by name anywhere in the folder
      return net.fetch(pathToFileURL(file).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
  // Sounds from the DM's sound folder (audio files only).
  protocol.handle('audio-file', (request) => {
    try {
      if (PLAYER_EDITION) return new Response('Not allowed', { status: 403 })
      const url = new URL(request.url)
      const relative = decodeURIComponent(url.pathname.slice(1))
      return net.fetch(pathToFileURL(safeAudioPath(url.hostname, relative)).toString(), { headers: request.headers })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
  registerHandlers()
  backupIfDue()
  const window = createWindow()
  wiki.startWatching(window)
})

app.on('window-all-closed', () => app.quit())
