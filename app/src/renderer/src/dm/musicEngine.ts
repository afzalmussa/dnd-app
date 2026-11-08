// Streams the DM's saved music links. YouTube links (a video or a playlist) play in a hidden embedded
// player that this file controls; a direct link to an audio file plays in an audio element. Nothing is
// downloaded or saved. Like the sound engine it lives outside React, so the music keeps playing.

type Listener = () => void

export interface Track {
  id: string
  name: string
  url: string
}

const listeners = new Set<Listener>()
let frame: HTMLIFrameElement | null = null
let audio: HTMLAudioElement | null = null
let currentId: string | null = null
let paused = false
let volume = 0.5

function changed(): void {
  listeners.forEach((l) => l())
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const state = () => ({ currentId, paused, volume })

// The YouTube address as an embed address, or null when the link is not a YouTube video or playlist.
export function embedUrl(link: string): string | null {
  let u: URL
  try { u = new URL(link) } catch { return null }
  const host = u.hostname.replace(/^(www|m)\./, '')
  const list = u.searchParams.get('list')
  const video = host === 'youtu.be' ? u.pathname.slice(1) : host === 'youtube.com' ? u.searchParams.get('v') : null
  if (host !== 'youtu.be' && host !== 'youtube.com') return null
  const base = 'https://www.youtube-nocookie.com/embed/'
  const common = 'enablejsapi=1&autoplay=1&controls=0&rel=0&playsinline=1'
  if (video && /^[\w-]{6,20}$/.test(video)) return `${base}${video}?${common}&loop=1&playlist=${video}`
  if (list && /^[\w-]+$/.test(list)) return `${base}videoseries?${common}&list=${list}&loop=1`
  return null
}

export function isPlayable(link: string): boolean {
  return embedUrl(link) !== null || /\.(mp3|ogg|wav|m4a|flac|opus)(\?.*)?$/i.test(link)
}

function command(func: string, args: unknown[] = []): void {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
}

function applyVolume(): void {
  if (audio) audio.volume = volume
  command('setVolume', [Math.round(volume * 100)])
}

export function stop(): void {
  if (audio) { audio.pause(); audio = null }
  if (frame) { frame.remove(); frame = null }
  currentId = null
  paused = false
  changed()
}

export function play(track: Track): void {
  stop()
  currentId = track.id
  const embed = embedUrl(track.url)
  if (embed) {
    frame = document.createElement('iframe')
    frame.src = embed
    frame.allow = 'autoplay; encrypted-media'
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:220px;height:140px;border:0'
    frame.addEventListener('load', () => { setTimeout(applyVolume, 800); setTimeout(applyVolume, 2500) })
    document.body.appendChild(frame)
  } else {
    audio = new Audio(track.url)
    audio.loop = true
    audio.volume = volume
    void audio.play().catch(() => stop())
  }
  changed()
}

export function togglePause(): void {
  if (!currentId) return
  paused = !paused
  if (audio) void (paused ? audio.pause() : audio.play())
  else command(paused ? 'pauseVideo' : 'playVideo')
  changed()
}

export function setVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v))
  applyVolume()
  changed()
}
