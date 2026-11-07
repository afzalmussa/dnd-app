// Settings: where characters and your own content are saved (a shared Google Drive folder works),
// whether this PC is the DM's, and the folder the DM view reads.

import { useEffect, useState } from 'react'
import type { AppSettings } from '../../../shared/api'

export function SettingsDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => { void window.api.getSettings().then(setSettings) }, [])

  async function choose(which: 'saveFolder' | 'contentFolder' | 'dmFolder' | 'notesFolder' | 'partyWikiFolder') {
    const next = await window.api.chooseFolder(which)
    if (next) { setSettings(next); onChanged() }
  }

  async function role(value: 'player' | 'dm') {
    setSettings(await window.api.setRole(value))
    onChanged()
  }

  const rows: { key: 'saveFolder' | 'contentFolder' | 'dmFolder' | 'notesFolder' | 'partyWikiFolder'; label: string; help: string }[] = [
    { key: 'saveFolder', label: 'Characters are saved in', help: 'Point this at a shared Google Drive folder so the party and the DM see the same sheets. Existing characters stay where they were; copy them over if you want them in the new place.' },
    { key: 'contentFolder', label: 'Your corrections and homebrew are saved in', help: 'Share this folder to give your table the same corrected spells, feats and items.' },
    { key: 'notesFolder', label: 'My Notes (private story notes) are saved in', help: 'Stays on this PC unless you move it somewhere shared. Plain Markdown files, so Obsidian can open them too.' },
    { key: 'partyWikiFolder', label: 'The Party Wiki folder', help: 'Normally the shared Google Drive copy of the player wiki. Everyone with the folder sees and edits the same pages. Leave it empty if you do not use a shared wiki.' },
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
                <code>{settings[r.key] || '(not set)'}</code>{' '}
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
