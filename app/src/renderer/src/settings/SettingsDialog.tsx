// Settings: where characters and your own content are saved (a shared Google Drive folder works),
// whether this PC is the DM's, and the folder the DM view reads.

import { useEffect, useState } from 'react'
import type { AppSettings, FolderKey } from '../../../shared/api'
import { PLAYER_EDITION } from '../edition'

export function SettingsDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [newPlayer, setNewPlayer] = useState('')

  useEffect(() => { void window.api.getSettings().then(setSettings) }, [])

  async function choose(which: FolderKey) {
    const next = await window.api.chooseFolder(which)
    if (next) { setSettings(next); onChanged() }
  }

  async function role(value: 'player' | 'dm') {
    setSettings(await window.api.setRole(value))
    onChanged()
  }

  const rows: { key: FolderKey; label: string; help: string }[] = [
    { key: 'saveFolder', label: 'Characters are saved in', help: 'Point this at a shared Google Drive folder so the party and the DM see the same sheets. Existing characters stay where they were; copy them over if you want them in the new place.' },
    { key: 'contentFolder', label: 'Your corrections and homebrew are saved in', help: 'Share this folder to give your table the same corrected spells, feats and items.' },
    { key: 'notesFolder', label: 'My Notes (private story notes) are saved in', help: 'Stays on this PC unless you move it somewhere shared. Plain Markdown files, so Obsidian can open them too.' },
    { key: 'partyWikiFolder', label: 'The Party Wiki folder', help: 'Normally the shared Google Drive copy of the player wiki. Everyone with the folder sees and edits the same pages. Leave it empty if you do not use a shared wiki.' },
    { key: 'privateFolder', label: 'From the DM (secrets just for you) is read from', help: 'A Drive folder the DM shares with you alone. Whatever the DM publishes as a secret for you appears in the Wiki under "From the DM". Leave it empty if you have none.' },
    { key: 'audioFolder', label: 'The sound library (DM) is read from', help: 'Audio files in sub-folders (Ambience, Combat and so on). The Sound tab lists them.' },
    { key: 'dmFolder', label: 'The DM view reads sheets from', help: 'The DM view only reads this folder. It never changes a character file.' }
  ]

  return (
    <div className="modal-backdrop">
      <div className="modal levelup">
        <header><h2>Settings</h2><button className="small" onClick={onClose}>Close</button></header>
        {!settings ? <p className="muted">Loading…</p> : (
          <section>
            {!PLAYER_EDITION && <div className="requirement">
              <h4>This PC is the</h4>
              <label><input type="radio" checked={settings.role === 'player'} onChange={() => role('player')} /> Player</label>{' '}
              <label><input type="radio" checked={settings.role === 'dm'} onChange={() => role('dm')} /> DM</label>
              <p className="muted small">As the DM you can publish notes to the players and move the campaign clock (open <strong>DM view</strong> in the toolbar, then use Advance or Reset next to the clock). Players read the clock automatically.</p>
            </div>}
            {rows.filter((r) => !(PLAYER_EDITION && (r.key === 'dmFolder' || r.key === 'audioFolder'))).map((r) => (
              <div className="requirement" key={r.key}>
                <h4>{r.label}</h4>
                <code>{settings[r.key] || '(not set)'}</code>{' '}
                <button className="small" onClick={() => choose(r.key)}>Choose folder…</button>
                <p className="muted small">{r.help}</p>
              </div>
            ))}
            {!PLAYER_EDITION && settings.role === 'dm' && (
              <div className="requirement">
                <h4>Player folders (for secrets)</h4>
                <p className="muted small">One Drive folder per player, shared with that player only. When you publish, a secret marked for that player goes into their folder. Type the name exactly as you write it in the secret ("Secret for…").</p>
                {Object.entries(settings.playerFolders).map(([name, folder]) => (
                  <div key={name} className="small"><strong>{name}</strong> <code>{folder}</code>{' '}
                    <button className="small danger" onClick={async () => { setSettings(await window.api.removePlayerFolder(name)); onChanged() }}>Remove</button></div>
                ))}
                <input type="text" className="text-input" placeholder="Player name, e.g. Auriviel" value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} />{' '}
                <button className="small" disabled={!newPlayer.trim()} onClick={async () => {
                  const next = await window.api.setPlayerFolder(newPlayer.trim())
                  if (next) { setSettings(next); setNewPlayer(''); onChanged() }
                }}>Choose their folder…</button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
