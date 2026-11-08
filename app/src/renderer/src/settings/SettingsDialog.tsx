// Settings: where characters and your own content are saved (a shared Google Drive folder works),
// whether this PC is the DM's, and the folder the DM view reads.

import { useEffect, useState } from 'react'
import type { AppSettings, FolderKey } from '../../../shared/api'
import { applyTheme, EDITABLE, loadTheme, THEMES, type ThemeChoice } from '../themes'
import { PLAYER_EDITION } from '../edition'

export function SettingsDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [newPlayer, setNewPlayer] = useState('')

  useEffect(() => { void window.api.getSettings().then(setSettings) }, [])

  async function choose(which: FolderKey) {
    const next = await window.api.chooseFolder(which)
    if (next) { setSettings(next); onChanged() }
  }

  const [theme, setTheme] = useState<ThemeChoice>(loadTheme)
  function chooseTheme(next: ThemeChoice) { setTheme(next); applyTheme(next) }
  const colourOf = (variable: string) => theme.overrides[variable] ?? THEMES[theme.name].vars[variable]
  const [campaignName, setCampaignName] = useState('')
  // Switching campaign changes every folder below, so the window is reloaded with the new campaign.
  async function campaignAction(run: () => Promise<AppSettings>) {
    try { await run(); window.location.reload() } catch (e) { alert((e as Error).message) }
  }
  const [backupNote, setBackupNote] = useState('')
  async function backUp() {
    setBackupNote('Backing up…')
    try {
      const r = await window.api.runBackup()
      setBackupNote(`Saved ${r.files} files (${Math.round(r.bytes / 1024)} KB) to ${r.file}`)
      setSettings(await window.api.getSettings())
    } catch (e) {
      setBackupNote((e as Error).message)
    }
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
    { key: 'backupFolder', label: 'Backups are saved in', help: 'Pick a Google Drive folder. A zip of your characters, corrections and notes is saved there once a day when the app opens, and when you press Back up now. The newest 15 are kept.' },
    { key: 'audioFolder', label: 'The sound library (DM) is read from', help: 'Audio files in sub-folders (Ambience, Combat and so on). The Sound tab lists them.' },
    { key: 'dmFolder', label: 'The DM view reads sheets from', help: 'The DM view only reads this folder. It never changes a character file.' }
  ]

  return (
    <div className="modal-backdrop">
      <div className="modal levelup">
        <header><h2>Settings</h2><button className="small" onClick={onClose}>Close</button></header>
        {!settings ? <p className="muted">Loading…</p> : (
          <section>
            <div className="requirement">
              <h4>Campaign</h4>
              <select value={settings.activeCampaign} onChange={(e) => void campaignAction(() => window.api.switchCampaign(e.target.value))}>
                {settings.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>{' '}
              <input type="text" className="text-input" placeholder="Name" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />{' '}
              <button className="small" disabled={!campaignName.trim()} onClick={() => void campaignAction(() => window.api.createCampaign(campaignName))}>New campaign</button>{' '}
              <button className="small" disabled={!campaignName.trim()} onClick={() => void campaignAction(() => window.api.renameCampaign(settings.activeCampaign, campaignName))}>Rename this one</button>{' '}
              <button className="small danger" disabled={settings.campaigns.length < 2} onClick={() => { if (confirm('Forget the settings of this campaign? Its files are not deleted.')) void campaignAction(() => window.api.deleteCampaign(settings.activeCampaign)) }}>Forget this campaign</button>
              <p className="muted small">Each campaign has its own characters, notes, party wiki, secrets, DM folder, backups and encounter. Homebrew corrections and the sound library are shared by all campaigns. A new campaign starts with empty folders: choose them below.</p>
            </div>
            <div className="requirement">
              <h4>Colours</h4>
              <select value={theme.name} onChange={(e) => chooseTheme({ name: e.target.value, overrides: {} })}>
                {Object.entries(THEMES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
              </select>
              <div className="theme-colours">
                {EDITABLE.map((c) => (
                  <label key={c.variable}>{c.label}{' '}
                    <input type="color" value={colourOf(c.variable)} onChange={(e) => chooseTheme({ ...theme, overrides: { ...theme.overrides, [c.variable]: e.target.value } })} />
                  </label>
                ))}
                <button className="small" disabled={Object.keys(theme.overrides).length === 0} onClick={() => chooseTheme({ name: theme.name, overrides: {} })}>Reset colours</button>
              </div>
              <p className="muted small">Pick a theme, then change the main colours if you like. Saved on this PC.</p>
            </div>
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
                {r.key === 'backupFolder' && <>{' '}<button className="small" disabled={!settings.backupFolder} onClick={backUp}>Back up now</button> <span className="small">{backupNote || (settings.lastBackup ? `Last backup ${new Date(settings.lastBackup).toLocaleString()}` : '')}</span></>}
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
