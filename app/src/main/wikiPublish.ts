// Publishing from the DM's notes to the players, using shared folders (Google Drive does the syncing).
//   - shared blocks go to <Party Wiki>/DM Shares/<page>.md, with an Index.md front page
//   - secret blocks go to the folder set for that player in Settings (share that Drive folder with that player only)
// Only the DM's PC can publish. The DM's own page is never changed.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import type { PublishSummary } from '../shared/api'
import { buildPublished, extractShareBlocks, indexMarkdown, publishedPath } from '../shared/wiki/publish'
import { allPagePaths, areaRoot, readPage } from './wikiFiles'
import { PLAYER_EDITION } from './edition'
import { loadSettings } from './settings'

function writeInside(root: string, relative: string, content: string): void {
  const base = resolve(root)
  const full = resolve(base, relative)
  if (!full.startsWith(base + sep)) throw new Error(`Outside the folder: ${relative}`)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(`${full}.tmp`, content, 'utf-8')
  renameSync(`${full}.tmp`, full)
}

function walkMarkdown(dir: string, rel = ''): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = rel ? `${rel}/${e.name}` : e.name
    return e.isDirectory() ? walkMarkdown(resolve(dir, e.name), path) : e.name.toLowerCase().endsWith('.md') ? [path] : []
  })
}

export function publish(scope: 'all' | 'page', pagePath?: string): PublishSummary {
  const settings = loadSettings()
  if (PLAYER_EDITION || settings.role !== 'dm') throw new Error('Only the DM can publish. Set this PC as the DM in Settings.')
  const notes = areaRoot('notes')
  const party = areaRoot('party')
  const summary: PublishSummary = { pages: 0, shared: 0, secrets: {}, warnings: [] }
  if (!notes) throw new Error('Choose your My Notes folder first (Settings).')
  const date = new Date().toISOString().slice(0, 10)
  const pages = scope === 'all' ? allPagePaths('notes') : [pagePath ?? '']
  const playerFolders = Object.fromEntries(Object.entries(settings.playerFolders).map(([k, v]) => [k.toLowerCase(), v]))

  for (const path of pages) {
    const blocks = extractShareBlocks(readPage('notes', path).content)
    if (blocks.length === 0) continue
    summary.pages += 1
    const title = (path.split('/').pop() ?? path).replace(/\.md$/i, '')

    const shared = blocks.filter((b) => b.kind === 'share')
    if (shared.length) {
      if (party) {
        writeInside(party, publishedPath(path), buildPublished(title, shared, date))
        summary.shared += shared.length
      } else summary.warnings.push('The Party Wiki folder is not set, so shared parts were not published.')
    }

    const byPlayer = new Map<string, typeof blocks>()
    for (const b of blocks.filter((x) => x.kind === 'secret')) {
      const key = (b.player ?? '').toLowerCase()
      byPlayer.set(key, [...(byPlayer.get(key) ?? []), b])
    }
    for (const [player, list] of byPlayer) {
      const folder = playerFolders[player]
      if (!folder) {
        const warn = `No private folder is set for "${list[0].player}", so their secrets were not published.`
        if (!summary.warnings.includes(warn)) summary.warnings.push(warn)
        continue
      }
      writeInside(folder, path, buildPublished(title, list, date))
      summary.secrets[list[0].player ?? player] = (summary.secrets[list[0].player ?? player] ?? 0) + list.length
    }
  }

  // the Party Wiki's front page for everything shared so far
  if (party) {
    const root = resolve(party, 'DM Shares')
    const entries = walkMarkdown(root).filter((p) => p !== 'Index.md').map((p) => {
      const text = readFileSync(resolve(root, p), 'utf-8')
      const published = text.match(/^published:\s*(\S+)/m)?.[1] ?? ''
      return { path: `DM Shares/${p}`, title: (p.split('/').pop() ?? p).replace(/\.md$/i, ''), date: published }
    })
    if (entries.length) writeInside(party, 'DM Shares/Index.md', indexMarkdown(entries))
  }
  return summary
}
