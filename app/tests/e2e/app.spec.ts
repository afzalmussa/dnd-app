import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Each test gets its own empty app-data folder, with settings written for it, so nothing real is touched.
async function launch(role: 'player' | 'dm'): Promise<{ app: ElectronApplication; page: Page; root: string }> {
  const root = mkdtempSync(join(tmpdir(), 'dnd-e2e-'))
  const folder = (name: string) => { const p = join(root, name); mkdirSync(p, { recursive: true }); return p }
  const audio = folder('audio')
  mkdirSync(join(audio, 'Ambience'), { recursive: true })
  writeFileSync(join(audio, 'Ambience', 'test_rain.wav'), Buffer.alloc(64))
  const settings = {
    saveFolder: folder('characters'), contentFolder: folder('content'), role, dmFolder: folder('characters'),
    notesFolder: folder('notes'), partyWikiFolder: folder('party'), privateFolder: '', playerFolders: {},
    audioFolder: audio, backupFolder: folder('backups'), lastBackup: null
  }
  const userData = folder('userdata')
  writeFileSync(join(userData, 'settings.json'), JSON.stringify(settings))
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd() })
  const page = await app.firstWindow()
  await page.waitForSelector('.toolbar')
  if (role === 'player') {
    await page.getByRole('button', { name: 'New character' }).click() // the picker opens first and covers the toolbar
    await expect(page.locator('.picker-backdrop')).toHaveCount(0)
  }
  return { app, page, root }
}

test('a player has no DM screens', async () => {
  const { app, page } = await launch('player')
  await expect(page.getByRole('button', { name: 'Wiki' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Encounters' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sound' })).toHaveCount(0)
  await app.close()
})

test('the DM sees the sound board and can search monsters', async () => {
  const { app, page } = await launch('dm')
  await page.getByRole('button', { name: 'Sound' }).click()
  await page.getByRole('button', { name: 'Ambience' }).click()
  await expect(page.getByRole('button', { name: /Test rain/ })).toBeVisible()
  await page.getByRole('button', { name: 'Encounters' }).click()
  await page.getByPlaceholder(/Add enemy/).fill('adult dragon')
  await expect(page.locator('.enemy-menu .link-row').first()).toContainText('Adult')
  await app.close()
})

test('a session recap page is created in the wiki', async () => {
  const { app, page, root } = await launch('dm')
  await page.getByRole('button', { name: 'New session recap' }).click() // the DM starts in the wiki
  await expect(page.locator('textarea').first()).toContainText('Session 1')
  await expect.poll(() => existsSync(join(root, 'notes', 'Sessions')) && readdirSync(join(root, 'notes', 'Sessions')).length).toBe(1)
  await app.close()
})

test('Back up now writes a zip to the backup folder', async () => {
  const { app, page, root } = await launch('player')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Back up now' }).click()
  await expect.poll(() => readdirSync(join(root, 'backups')).filter((f) => f.endsWith('.zip')).length).toBe(1)
  await app.close()
})

test('the wiki pops out into its own window', async () => {
  const { app, page } = await launch('dm')
  const opened = app.waitForEvent('window')
  await page.getByRole('button', { name: 'Pop out' }).click()
  const popup = await opened
  await expect(popup.getByRole('button', { name: 'New session recap' })).toBeVisible()
  await app.close()
})

test('the DM opens straight into the wiki, and then into the screen they left', async () => {
  const { app, page, root } = await launch('dm')
  await expect(page.locator('.picker-backdrop')).toHaveCount(0)
  await expect(page.locator('.wiki')).toBeVisible()
  await page.getByRole('button', { name: 'Encounters' }).click()
  await expect(page.locator('.encounters')).toBeVisible()
  await app.close()
  // second launch with the same profile
  const again = await electron.launch({ args: ['.', `--user-data-dir=${join(root, 'userdata')}`], cwd: process.cwd() })
  const page2 = await again.firstWindow()
  await expect(page2.locator('.encounters')).toBeVisible()
  await again.close()
})
