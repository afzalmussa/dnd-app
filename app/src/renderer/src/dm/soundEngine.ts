// Plays the DM's sounds. It lives outside React so a loop keeps playing when you switch tabs.
// Loops fade in and out; one-shot effects can overlap. One master volume covers everything here.

type Listener = () => void

const loops = new Map<string, HTMLAudioElement>()
const once = new Set<HTMLAudioElement>() // effects and narration still playing
const listeners = new Set<Listener>()
let volume = 0.7
let version = 0 // changes whenever something playing or the volume changes, so screens can redraw

function changed(): void {
  version += 1
  listeners.forEach((l) => l())
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function isPlaying(id: string): boolean {
  return loops.has(id)
}

export const getVersion = () => version

export function getVolume(): number {
  return volume
}

export function setVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v))
  loops.forEach((a) => { a.volume = volume })
  once.forEach((a) => { a.volume = volume })
  changed()
}

function fade(audio: HTMLAudioElement, to: number, done?: () => void): void {
  const step = (to - audio.volume) / 12
  let n = 0
  const timer = setInterval(() => {
    n += 1
    audio.volume = Math.min(1, Math.max(0, n >= 12 ? to : audio.volume + step))
    if (n >= 12) {
      clearInterval(timer)
      done?.()
    }
  }, 60)
}

export function toggleLoop(id: string, url: string): void {
  const running = loops.get(id)
  if (running) {
    loops.delete(id)
    fade(running, 0, () => running.pause())
  } else {
    const audio = new Audio(url)
    audio.loop = true
    audio.volume = 0
    loops.set(id, audio)
    void audio.play().then(() => fade(audio, volume)).catch(() => { loops.delete(id); changed() })
  }
  changed()
}

export function playOnce(url: string): void {
  const audio = new Audio(url)
  audio.volume = volume
  once.add(audio)
  audio.addEventListener('ended', () => once.delete(audio))
  void audio.play().catch(() => once.delete(audio))
}

export function stopAll(): void {
  loops.forEach((a) => fade(a, 0, () => a.pause()))
  loops.clear()
  once.forEach((a) => a.pause()) // narration and effects stop at once
  once.clear()
  changed()
}
