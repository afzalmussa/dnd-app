// The DM's Sound tab: a soundboard of ambience loops and one-shot effects from the sound folder, and a
// Music list of saved YouTube (or direct audio) links with play / pause and one volume control.
// Sounds keep playing when you leave this tab.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { SoundInfo } from '../../../shared/api'
import { useStoredState } from '../storedState'
import * as music from './musicEngine'
import * as sound from './soundEngine'

const MUSIC = 'Streaming music'
const CATEGORY_ORDER = ['Campaign', 'Ambience', 'Combat', 'Magic', 'Creatures', 'Ambient Music', 'Battle Music']
const ICONS: [RegExp, string][] = [
  [/door|gate|knock/i, '🚪'], [/sword|blade|steel|clash|weapon|swing/i, '⚔️'], [/arrow|bow/i, '🏹'], [/fire|flame|torch|burn/i, '🔥'],
  [/thunder|storm|lightning/i, '⛈️'], [/rain/i, '🌧️'], [/wind|gust/i, '🌬️'], [/water|river|stream|sea|ocean|wave|drip/i, '🌊'], [/forest|jungle|bird|night/i, '🌲'],
  [/tavern|inn|crowd|pub/i, '🍺'], [/coin|gold|treasure/i, '🪙'], [/chest|lock|key/i, '🧰'], [/horse|hoof/i, '🐎'], [/footstep|walk|step/i, '👣'],
  [/dragon|roar|growl|monster|beast|wolf/i, '🐉'], [/magic|spell|arcane|power|teleport|heal|zap/i, '✨'], [/cave|dungeon|crypt|tomb/i, '🕳️'],
  [/bell|chime|gong/i, '🔔'], [/explo|boom|blast/i, '💥'], [/scream|ghost|spook|eerie|haunt/i, '👻'], [/camp|fireplace|crackl/i, '🏕️'], [/market|town|city/i, '🏘️'],
  [/punch|hit|impact|smash|crash/i, '👊'], [/bubbl|potion|poison/i, '🧪']
]

function iconFor(s: SoundInfo): string {
  return ICONS.find(([re]) => re.test(s.name) || re.test(s.id))?.[1] ?? (s.loop ? '🔁' : '🔊')
}

function SoundButton({ s, playing }: { s: SoundInfo; playing: boolean }) {
  return (
    <button className={`sound-btn ${playing ? 'on' : ''}`} title={s.credit ?? s.name}
      onClick={() => (s.loop ? sound.toggleLoop(s.id, s.url) : sound.playOnce(s.url))}>
      <span className="sound-icon">{iconFor(s)}</span>
      <span className="sound-name">{s.name}</span>
      {s.loop && <span className="sound-loop">{playing ? 'playing' : 'loop'}</span>}
    </button>
  )
}

function MusicList() {
  const [tracks, setTracks] = useStoredState<music.Track[]>('musicLinks', [])
  const [link, setLink] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const now = useSyncExternalStore(music.subscribe, () => JSON.stringify(music.state()))
  const { currentId, paused, volume } = JSON.parse(now) as ReturnType<typeof music.state>

  async function fillName(url: string) {
    if (name || !url) return
    const title = await window.api.youtubeTitle(url.trim())
    if (title) setName((current) => current || title)
  }

  function add() {
    const url = link.trim()
    if (!music.isPlayable(url)) {
      setNote('Paste a YouTube video or playlist link, or a direct link to an audio file (mp3, ogg, wav). Spotify cannot be played inside this app.')
      return
    }
    setTracks([...tracks, { id: `${Date.now()}`, name: name.trim() || url, url }])
    setLink('')
    setName('')
    setNote('')
  }

  return (
    <div className="music">
      <div className="music-add">
        <input type="text" className="text-input" placeholder="Paste a YouTube link…" value={link}
          onChange={(e) => setLink(e.target.value)} onBlur={() => fillName(link)} onPaste={(e) => { const t = e.clipboardData.getData('text'); setTimeout(() => fillName(t), 0) }} />
        <input type="text" className="text-input" placeholder="Name (filled in from YouTube)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary small" disabled={!link.trim()} onClick={add}>Save</button>
      </div>
      {note && <p className="warning small">{note}</p>}
      <div className="music-volume">
        <span>Music volume</span>
        <input type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={(e) => music.setVolume(Number(e.target.value) / 100)} />
        <span className="muted small">{Math.round(volume * 100)}</span>
        {currentId && <button className="small danger" onClick={music.stop}>Stop</button>}
      </div>
      {tracks.length === 0 && <p className="muted">No music saved yet. Paste a link above. It plays by streaming; nothing is downloaded.</p>}
      <ul className="music-list">
        {tracks.map((t) => {
          const active = currentId === t.id
          return (
            <li key={t.id} className={active ? 'on' : ''}>
              <button className="small" onClick={() => (active ? music.togglePause() : music.play(t))}>{active && !paused ? '⏸ Pause' : '▶ Play'}</button>
              <span className="track-name">{t.name}</span>
              <button className="small danger" title="Remove from the list" onClick={() => { if (active) music.stop(); setTracks(tracks.filter((x) => x.id !== t.id)) }}>×</button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function SoundboardTab() {
  const [sounds, setSounds] = useState<SoundInfo[] | null>(null)
  const [category, setCategory] = useStoredState<string>('soundCategory', MUSIC)
  useSyncExternalStore(sound.subscribe, sound.getVersion) // redraw when a loop starts or stops
  useEffect(() => { void window.api.listSounds().then(setSounds).catch(() => setSounds([])) }, [])

  const categories = useMemo(() => {
    const names = [...new Set((sounds ?? []).map((s) => s.category))]
    return names.sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b))
  }, [sounds])
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = category === MUSIC ? [] : (sounds ?? []).filter((s) => s.category === category && (!q || s.name.toLowerCase().includes(q) || s.group.toLowerCase().includes(q)))
  const groups = [...new Set(shown.map((s) => s.group))]

  return (
    <div className="soundboard">
      <div className="sound-bar">
        {categories.map((c) => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}
        <button className={category === MUSIC ? 'active' : ''} onClick={() => setCategory(MUSIC)}>{MUSIC}</button>
        <span className="sound-master">
          Volume <input type="range" min={0} max={100} value={Math.round(sound.getVolume() * 100)} onChange={(e) => sound.setVolume(Number(e.target.value) / 100)} />
          <button className="small danger" onClick={sound.stopAll}>Stop sounds</button>
        </span>
      </div>
      {category === MUSIC ? <MusicList /> : (
        <>
          {sounds && sounds.length === 0 && <p className="warning">No sounds found. Put audio files in sub-folders of the sound folder (Settings shows where), or run the audio fetch tool (README).</p>}
          <input type="text" className="text-input sound-search" placeholder={`Search ${category}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
          {groups.map((g) => (
            <section key={g}>
              {g && <h4 className="sound-group">{g}</h4>}
              <div className="sound-grid">{shown.filter((s) => s.group === g).map((s) => <SoundButton key={s.id} s={s} playing={sound.isPlaying(s.id)} />)}</div>
            </section>
          ))}
          {sounds && sounds.length > 0 && shown.length === 0 && <p className="muted">Nothing matches.</p>}
        </>
      )}
    </div>
  )
}
