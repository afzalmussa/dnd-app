// Plays the DM's saved music links. A YouTube link streams through a hidden window the main process
// controls (see src/main/music.ts); a direct link to an audio file plays in an audio element. Nothing is
// downloaded or saved. This file lives outside React, so the music keeps playing when you change tabs.

type Listener = () => void

export interface Track {
  id: string
  name: string
  url: string
}

export interface Playing {
  currentId: string | null
  paused: boolean
  volume: number
  position: number // seconds
  duration: number // seconds, 0 when unknown
  ad: boolean
  error: string
}

const listeners = new Set<Listener>()
let audio: HTMLAudioElement | null = null
let youtube = false
let timer: ReturnType<typeof setInterval> | null = null
let now: Playing = { currentId: null, paused: false, volume: 0.5, position: 0, duration: 0, ad: false, error: '' }

function set(change: Partial<Playing>): void {
  now = { ...now, ...change }
  listeners.forEach((l) => l())
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const state = (): Playing => now

// A YouTube video address, or null for anything else. A playlist link that names a video (watch?v=…&list=…) works;
// a bare playlist link does not, because YouTube needs a video to start from.
export function youtubeUrl(link: string): string | null {
  try {
    const u = new URL(link)
    const host = u.hostname.replace(/^(www|m)\./, '')
    if (u.protocol !== 'https:' || (host !== 'youtube.com' && host !== 'youtu.be')) return null
    const video = host === 'youtu.be' ? u.pathname.slice(1) : u.pathname === '/watch' ? u.searchParams.get('v') : null
    if (!video || !/^[\w-]{6,20}$/.test(video)) return null
    const list = u.searchParams.get('list')
    return `https://www.youtube.com/watch?v=${video}${list && /^[\w-]+$/.test(list) ? `&list=${list}` : ''}`
  } catch {
    return null
  }
}

export function isPlayable(link: string): boolean {
  return youtubeUrl(link) !== null || /^https:\/\/.+\.(mp3|ogg|wav|m4a|flac|opus)(\?.*)?$/i.test(link)
}

function startPolling(): void {
  if (timer) clearInterval(timer)
  timer = setInterval(async () => {
    if (!now.currentId) return
    if (youtube) {
      const s = await window.api.musicState().catch(() => null)
      if (s) set({ position: s.position, duration: s.duration, paused: s.paused, ad: s.ad })
    } else if (audio) {
      set({ position: audio.currentTime, duration: isFinite(audio.duration) ? audio.duration : 0, paused: audio.paused })
    }
  }, 500)
}

export function stop(): void {
  if (timer) { clearInterval(timer); timer = null }
  if (audio) { audio.pause(); audio = null }
  if (youtube) void window.api.musicControl({ action: 'stop' })
  youtube = false
  set({ currentId: null, paused: false, position: 0, duration: 0, ad: false, error: '' })
}

export async function play(track: Track): Promise<void> {
  stop()
  const yt = youtubeUrl(track.url)
  set({ currentId: track.id, error: '' })
  startPolling()
  if (yt) {
    youtube = true
    try {
      await window.api.musicPlay(yt, now.volume)
    } catch (e) {
      stop()
      set({ error: (e as Error).message })
    }
  } else {
    audio = new Audio(track.url)
    audio.loop = true
    audio.volume = now.volume
    await audio.play().catch(() => { stop(); set({ error: 'That file could not be played.' }) })
  }
}

export function togglePause(): void {
  if (!now.currentId) return
  const pause = !now.paused
  if (audio) void (pause ? audio.pause() : audio.play())
  else void window.api.musicControl({ action: pause ? 'pause' : 'resume' })
  set({ paused: pause })
}

// Jump to a point in the song (seconds).
export function seek(seconds: number): void {
  const t = Math.max(0, now.duration ? Math.min(seconds, now.duration) : seconds)
  if (audio) audio.currentTime = t
  else void window.api.musicControl({ action: 'seek', value: t })
  set({ position: t })
}

export function setVolume(v: number): void {
  const volume = Math.min(1, Math.max(0, v))
  if (audio) audio.volume = volume
  else if (youtube) void window.api.musicControl({ action: 'volume', value: volume })
  set({ volume })
}
