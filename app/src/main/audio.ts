// The DM's sound library: audio files in a folder, grouped by sub-folder (Ambience, Combat, ...).
// Optional credits.json in that folder gives each file a display name, a loop flag and its credit:
//   { "Ambience/tavern.ogg": { "name": "Tavern", "loop": true, "credit": "Author, CC0, source URL" } }
// Files play through audio-file://sounds/<path>; only audio files inside the folder are served.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import type { MusicTrackInfo, SoundInfo } from '../shared/api'
import { PLAYER_EDITION } from './edition'
import { loadSettings } from './settings'

export const AUDIO_TYPES = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.opus'])
// Ambience and music play as loops; everything else is a one-shot effect.
const LOOPING = /ambience|music/i

export function audioFolder(): string {
  return loadSettings().audioFolder
}

// `host` is "sounds" (the sound library) or "m0", "m1"... (the DM's music folders, in the order Settings lists them).
export function folderForHost(host: string): string {
  if (host === 'sounds') return audioFolder()
  const m = host.match(/^m(\d+)$/)
  const folder = m ? loadSettings().musicFolders[Number(m[1])]?.folder : undefined
  if (!folder) throw new Error('Unknown music folder')
  return folder
}

export function safeAudioPath(host: string, relative: string): string {
  const base = resolve(folderForHost(host))
  const full = resolve(base, relative)
  if (!full.startsWith(base + sep) || !AUDIO_TYPES.has(extname(full).toLowerCase())) throw new Error('Not an audio file in the sound folder')
  return full
}

function walk(dir: string, rel = ''): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) return walk(join(dir, e.name), path)
    return AUDIO_TYPES.has(extname(e.name).toLowerCase()) ? [path] : []
  })
}

function prettify(file: string): string {
  const base = file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return base.charAt(0).toUpperCase() + base.slice(1)
}

export function listSounds(): SoundInfo[] {
  if (PLAYER_EDITION) return []
  const folder = audioFolder()
  let meta: Record<string, { name?: string; loop?: boolean; credit?: string }> = {}
  try {
    meta = JSON.parse(readFileSync(join(folder, 'credits.json'), 'utf-8'))
  } catch {
    // no credits file, or a damaged one: names come from the file names
  }
  return walk(folder).map((path) => {
    const parts = path.split('/')
    const category = parts.length > 1 ? parts[0] : 'Sounds'
    const group = parts.length > 2 ? parts[1].replace(/[-_]+/g, ' ') : ''
    const m = meta[path] ?? {}
    return {
      id: path, category, group, name: m.name ?? prettify(parts[parts.length - 1]),
      loop: m.loop ?? LOOPING.test(category), credit: m.credit ?? null,
      url: `audio-file://sounds/${path.split('/').map(encodeURIComponent).join('/')}`
    }
  }).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
}

// The title of a YouTube video, from YouTube's public oEmbed address (no key needed).
export async function youtubeTitle(url: string): Promise<string | null> {
  if (PLAYER_EDITION || !/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(url)) return null
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`)
    return res.ok ? ((await res.json()) as { title?: string }).title ?? null : null
  } catch {
    return null
  }
}

// Every audio file in the music folders chosen in Settings, grouped by the folder's name.
export function listMusic(): MusicTrackInfo[] {
  if (PLAYER_EDITION) return []
  return loadSettings().musicFolders.flatMap((f, i) =>
    walk(f.folder).map((path) => ({
      id: `${i}:${path}`, group: f.name, name: prettify(path.split('/').pop() ?? path),
      url: `audio-file://m${i}/${path.split('/').map(encodeURIComponent).join('/')}`
    })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })))
}
