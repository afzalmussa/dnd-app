// The list of saved characters, shown at start-up and from the Characters button.

import { useEffect, useState } from 'react'
import type { CharacterListEntry } from '../../shared/api'

export function CharacterPicker(props: {
  onOpen: (fileName: string) => void
  onNew: () => void
  onImport: () => void
  onClose?: () => void
  currentFileName: string | null
}) {
  const [entries, setEntries] = useState<CharacterListEntry[] | null>(null)
  const [folder, setFolder] = useState('')

  async function refresh() {
    setEntries(await window.api.listCharacters())
    setFolder(await window.api.getSaveFolder())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function remove(entry: CharacterListEntry) {
    if (!confirm(`Delete ${entry.name}? This removes the file from the save folder.`)) return
    await window.api.deleteCharacter(entry.fileName)
    refresh()
  }

  return (
    <div className="picker-backdrop">
      <div className="picker">
        <header className="box-title">
          <span>Characters</span>
          {props.onClose && <button className="small" onClick={props.onClose}>Close</button>}
        </header>
        <p className="muted small">Save folder: {folder}</p>
        {entries === null && <p>Loading…</p>}
        {entries?.length === 0 && <p className="muted">No characters yet.</p>}
        <ul className="picker-list">
          {entries?.map((entry) => (
            <li key={entry.fileName} className={entry.readable ? '' : 'unreadable'}>
              <div>
                <strong>{entry.name}</strong>
                <div className={entry.readable ? 'muted small' : 'warning small'}>{entry.summary}</div>
              </div>
              <div className="picker-actions">
                <button disabled={!entry.readable} onClick={() => props.onOpen(entry.fileName)}>
                  {entry.fileName === props.currentFileName ? 'Open (current)' : 'Open'}
                </button>
                <button className="small danger" disabled={entry.fileName === props.currentFileName} onClick={() => remove(entry)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="picker-footer">
          <button onClick={props.onNew}>New character</button>
          <button onClick={props.onImport}>Import from file…</button>
        </div>
      </div>
    </div>
  )
}
