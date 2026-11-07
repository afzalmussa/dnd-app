// Settings: where characters and your own content are saved (a shared Google Drive folder works),
// whether this PC is the DM's, and the folder the DM view reads.

import { useEffect, useState } from 'react'
import type { AppSettings } from '../../../shared/api'

export function SettingsDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => { void window.api.getSettings().then(setSettings) }, [])

  async function choose(which: 'saveFolder' | 'contentFolder' | 'dmFolder') {
    const next = await window.api.chooseFolder(which)
    if (next) { setSettings(next); onChanged() }
  }

  async function role(value: 'player' | 'dm') {
    setSettings(await window.api.setRole(value))
    onChanged()
  }

  const rows: { key: 'saveFolder' | 'contentFolder' | 'dmFolder'; label: string; help: string }[] = [
    { key: 'saveFolder', label: 'Characters are saved in', help: 'Point this at a shared Google Drive folder so the party and the DM see the same sheets. Existing characters stay where they were; copy them over if you want them in the new place.' },
    { key: 'contentFolder', label: 'Your corrections and homebrew are saved in', help: 'Share this folder to give your table the same corrected spells, feats and items.' },
    { key: 'dmFolder', label: 'The DM view reads sheets from', help: 'The DM view only reads this folder. It never changes a character file.' }
  ]

  return (
    <div className="modal-backdrop">
      <div className="modal levelup">
        <header><h2>Settings</h2><button className="small" onClick={onClose}>Close</button></header>
        {!settings ? <p className="muted">Loading…</p> : (
          <section>
            <div className="requirement">
              <h4>This PC is the</h4>
              <label><input type="radio" checked={settings.role === 'player'} onChange={() => role('player')} /> Player</label>{' '}
              <label><input type="radio" checked={settings.role === 'dm'} onChange={() => role('dm')} /> DM (can set the campaign clock)</label>
            </div>
            {rows.map((r) => (
              <div className="requirement" key={r.key}>
                <h4>{r.label}</h4>
                <code>{settings[r.key]}</code>{' '}
                <button className="small" onClick={() => choose(r.key)}>Choose folder…</button>
                <p className="muted small">{r.help}</p>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
