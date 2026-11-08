// Wiki files: two areas, "My Notes" and "Party Wiki", each a folder of ordinary Markdown files.
// The main process only reads and writes inside those two folders. Paths from the screen are
// relative and checked, the same approach as character files. See docs/wiki-design.md.

import { BrowserWindow, shell } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type { WikiPage, WikiTreeNode, WriteResult } from '../shared/api'
import { isSafeRelativePath, rewriteLinksOnRename, type Area } from '../shared/wiki/wiki'
import { loadSettings } from './settings'

export function areaRoot(area: Area): string | null {
  const s = loadSettings()
  const folder = area === 'notes' ? s.notesFolder : area === 'party' ? s.partyWikiFolder : s.privateFolder
  return folder && folder.trim() !== '' ? folder : null
}

// The absolute path for a relative one, or an error if it would leave the area's folder.
export function safePath(area: Area, relative: string): string {
  const root = areaRoot(area)
  if (!root) throw new Error(area === 'notes' ? 'The My Notes folder is not set.' : area === 'party' ? 'The Party Wiki folder is not set.' : 'The From-the-DM folder is not set.')
  if (relative !== '' && !isSafeRelativePath(relative)) throw new Error(`Not a page path: ${relative}`)
  const full = resolve(root, relative)
  const base = resolve(root)
  if (full !== base && !full.startsWith(base + sep)) throw new Error(`Outside the wiki folder: ${relative}`)
  return full
}

function walk(dir: string, rel: string): WikiTreeNode[] {
  const out: WikiTreeNode[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue // .obsidian, .trash and the like
    const path = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push({ name: entry.name, path, type: 'folder', children: walk(join(dir, entry.name), path) })
    else if (entry.name.toLowerCase().endsWith('.md')) out.push({ name: entry.name.replace(/\.md$/i, ''), path, type: 'file' })
  }
  return out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1))
}

export function listTree(area: Area): WikiTreeNode[] | null {
  const root = areaRoot(area)
  if (!root) return null
  mkdirSync(root, { recursive: true })
  return walk(root, '')
}

export function allPagePaths(area: Area): string[] {
  const flatten = (nodes: WikiTreeNode[]): string[] => nodes.flatMap((n) => (n.type === 'file' ? [n.path] : flatten(n.children ?? [])))
  return flatten(listTree(area) ?? [])
}

export function readPage(area: Area, relative: string): WikiPage {
  const full = safePath(area, relative)
  return { content: readFileSync(full, 'utf-8'), modified: statSync(full).mtimeMs }
}

// Writes to a temporary file first, then renames, so a crash cannot leave half a page behind.
function atomicWrite(full: string, content: string): number {
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(`${full}.tmp`, content, 'utf-8')
  renameSync(`${full}.tmp`, full)
  return statSync(full).mtimeMs
}

// `expectedModified` is the file's time when the page was opened. If the file changed since (another
// player's edit synced by Drive, or the DM in Obsidian) nothing is written and the new text is returned.
// The "From the DM" folder belongs to the DM's publishing; players read it but never change it.
function writable(area: Area): void {
  if (area === 'private') throw new Error('This folder is read-only: it is where the DM publishes things just for you.')
}

export function writePage(area: Area, relative: string, content: string, expectedModified: number | null, overwrite: boolean): WriteResult {
  writable(area)
  const full = safePath(area, relative)
  if (!overwrite && expectedModified !== null && existsSync(full)) {
    const now = statSync(full).mtimeMs
    if (Math.abs(now - expectedModified) > 1) return { ok: false, conflict: true, theirs: readFileSync(full, 'utf-8'), modified: now }
  }
  return { ok: true, modified: atomicWrite(full, content) }
}

// "Name (my copy).md" next to the page, for when the other version should be kept.
export function saveCopy(area: Area, relative: string, content: string): string {
  writable(area)
  const copy = relative.replace(/\.md$/i, '') + ' (my copy).md'
  atomicWrite(safePath(area, copy), content)
  return copy
}

export function createPage(area: Area, relative: string, content = ''): void {
  writable(area)
  const full = safePath(area, relative)
  if (existsSync(full)) throw new Error('A page with that name already exists.')
  atomicWrite(full, content)
}

export function createFolder(area: Area, relative: string): void {
  writable(area)
  mkdirSync(safePath(area, relative), { recursive: true })
}

// Renames a page and rewrites [[links]] to it in the same area, as Obsidian does. Returns the pages changed.
export function renamePage(area: Area, relative: string, newRelative: string): string[] {
  writable(area)
  const from = safePath(area, relative)
  const to = safePath(area, newRelative)
  if (existsSync(to)) throw new Error('A page with that name already exists.')
  mkdirSync(dirname(to), { recursive: true })
  renameSync(from, to)
  const changed: string[] = []
  for (const path of allPagePaths(area)) {
    const full = safePath(area, path)
    const text = readFileSync(full, 'utf-8')
    const next = rewriteLinksOnRename(text, relative, newRelative)
    if (next !== text) {
      atomicWrite(full, next)
      changed.push(path)
    }
  }
  return changed
}

// To the Recycle Bin, never permanent.
export async function trashPage(area: Area, relative: string): Promise<void> {
  writable(area)
  await shell.trashItem(safePath(area, relative))
}

export function allPagesWithText(area: Area): { path: string; text: string }[] {
  return allPagePaths(area).map((path) => ({ path, text: readFileSync(safePath(area, path), 'utf-8') }))
}

// Tells the open window when files change on disk (Drive syncing, Obsidian). Recursive watching is built in on Windows.
const watchers = new Map<Area, FSWatcher>()
export function startWatching(window: BrowserWindow): void {
  for (const area of ['notes', 'party', 'private'] as Area[]) {
    watchers.get(area)?.close()
    watchers.delete(area)
    const root = areaRoot(area)
    if (!root || !existsSync(root)) continue
    let timer: ReturnType<typeof setTimeout> | null = null
    try {
      const w = watch(root, { recursive: true }, () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => { if (!window.isDestroyed()) window.webContents.send('wikiChanged', area) }, 400)
      })
      watchers.set(area, w)
    } catch {
      // watching is a convenience; the screen still has a Refresh button
    }
  }
}

// Obsidian finds an image by its file name anywhere in the vault ("Burgomasters Mansion.png" in an Assets
// folder). When the path written in a page does not exist, look for a file with that name elsewhere in the area.
const imageIndex = new Map<string, { at: number; byName: Map<string, string> }>()

export function findAttachment(area: Area, relative: string): string | null {
  const root = areaRoot(area)
  if (!root) return null
  let entry = imageIndex.get(area)
  const lookup = (e: NonNullable<typeof entry>) => e.byName.get((relative.split('/').pop() ?? '').toLowerCase()) ?? null
  if (entry && Date.now() - entry.at < 30_000) {
    const hit = lookup(entry)
    if (hit) return hit
  }
  const byName = new Map<string, string>()
  const scan = (dir: string, depth: number) => {
    if (depth > 12) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) scan(full, depth + 1)
      else if (!byName.has(e.name.toLowerCase())) byName.set(e.name.toLowerCase(), full)
    }
  }
  try { scan(resolve(root), 0) } catch { /* unreadable folder: nothing found */ }
  entry = { at: Date.now(), byName }
  imageIndex.set(area, entry)
  return lookup(entry)
}
