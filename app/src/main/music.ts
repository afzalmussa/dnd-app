// Streams a YouTube video's audio through a hidden window and reports on it. YouTube refuses its embedded
// player inside a desktop app, but the ordinary watch page plays fine, so a hidden window opens that page
// and this file controls its <video> element: pause, volume, jumping to a point, and reading the position.
// Nothing is downloaded or saved. Only YouTube addresses are opened.

import { BrowserWindow } from 'electron'
import type { MusicControl, MusicState } from '../shared/api'
import { PLAYER_EDITION } from './edition'

let player: BrowserWindow | null = null

export function isYoutube(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && /^(www\.|m\.)?(youtube\.com|youtu\.be)$/.test(u.hostname)
  } catch {
    return false
  }
}

export function stopMusic(): void {
  if (player && !player.isDestroyed()) player.destroy()
  player = null
}

const run = (script: string) => (player && !player.isDestroyed() ? player.webContents.executeJavaScript(script, true) : Promise.resolve(null))

export async function playMusic(url: string, volume: number): Promise<void> {
  if (PLAYER_EDITION || !isYoutube(url)) throw new Error('Only YouTube links can be streamed.')
  stopMusic()
  player = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', partition: 'music' } })
  player.webContents.setAudioMuted(false)
  // Links that open a new window or leave YouTube are ignored.
  player.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  await player.loadURL(url)
  // Wait for the page's video, then start it at the chosen volume.
  for (let i = 0; i < 40; i++) {
    const ok = await run(`(() => { const v = document.querySelector('video'); if (!v) return false; v.volume = ${Math.min(1, Math.max(0, volume))}; v.loop = true; if (v.paused) v.play(); return true })()`)
    if (ok) return
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('YouTube did not start the video.')
}

export async function musicState(): Promise<MusicState | null> {
  const s = (await run(`(() => { const v = document.querySelector('video'); if (!v) return null;
    return { position: v.currentTime || 0, duration: isFinite(v.duration) ? v.duration : 0, paused: v.paused, ad: !!document.querySelector('.ad-showing'),
      title: (document.title || '').replace(/ - YouTube$/, '') } })()`).catch(() => null)) as MusicState | null
  return s
}

export async function musicControl(c: MusicControl): Promise<void> {
  if (c.action === 'pause') await run(`document.querySelector('video')?.pause()`)
  else if (c.action === 'resume') await run(`document.querySelector('video')?.play()`)
  else if (c.action === 'seek') await run(`(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${Math.max(0, Number(c.value) || 0)} })()`)
  else if (c.action === 'volume') await run(`(() => { const v = document.querySelector('video'); if (v) v.volume = ${Math.min(1, Math.max(0, Number(c.value) || 0))} })()`)
  else if (c.action === 'stop') stopMusic()
}
