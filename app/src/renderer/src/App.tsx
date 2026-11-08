// The app window: toolbar, the open character, autosave and the roll log.

import { exhaustionRollPenalty } from '../../shared/rules/exhaustion'
import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent } from 'react'
import { createBlankCharacter } from '../../shared/character'
import { PLAYER_EDITION } from './edition'

// The DM's screens are loaded only in the DM build. In the players' build this is decided at build time,
// so their code is not in the players' app at all.
const SoundboardTab = PLAYER_EDITION ? () => null : lazy(() => import('./dm/SoundboardTab').then((m) => ({ default: m.SoundboardTab })))
const EncountersTab = PLAYER_EDITION ? () => null : lazy(() => import('./dm/EncountersTab').then((m) => ({ default: m.EncountersTab })))
const PartyView = PLAYER_EDITION ? (_: { onClose: () => void }) => null : lazy(() => import('./dm/PartyView').then((m) => ({ default: m.PartyView })))
import { WikiView } from './wiki/WikiView'
import { ContentEditor } from './editor/ContentEditor'
import { SettingsDialog } from './settings/SettingsDialog'
import type { RollMode } from '../../shared/rules/dice'
import type { CharacterFile } from '../../shared/schema/character'
import { CharacterPicker } from './CharacterPicker'
import { PopoutWindow } from './PopoutWindow'
import { ResizeHandle } from './ResizeHandle'
import { RollLog, type DockPosition } from './RollLog'
import { d20Entry, diceEntry, rollClass, rollText, type RollEntry } from './rolls'
import { Sheet } from './sheet/Sheet'
import { SheetContext, type SheetContextValue } from './SheetContext'
import { useStoredState } from './storedState'

type SaveStatus = 'saved' | 'saving' | 'unsaved' | { error: string }

const AUTOSAVE_DELAY_MS = 500

export default function App() {
  const [character, setCharacter] = useState<CharacterFile | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [showEditor, setShowEditor] = useState(false)
  const [showParty, setShowParty] = useState(false)
  const [showEncounters, setShowEncounters] = useState(false)
  const [showSound, setShowSound] = useState(false)
  const [role, setRole] = useState<'player' | 'dm'>('player')
  const refreshRole = () => { void window.api.getSettings().then((s) => setRole(s.role)) }
  useEffect(refreshRole, [])
  const [showWiki, setShowWiki] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [rolls, setRolls] = useState<RollEntry[]>([])
  const [rollMode, setRollMode] = useState<RollMode>('normal')

  // Where the roll log sits and how big it is, remembered between sessions.
  const [dock, setDock] = useStoredState<DockPosition>('rollLog.dock', 'bottom')
  const [logSize, setLogSize] = useStoredState('rollLog.size', { bottom: 180, right: 380 })
  const [logCollapsed, setLogCollapsed] = useStoredState('rollLog.collapsed', false)
  const workspace = useRef<HTMLDivElement>(null)

  // Called while the resize bar is dragged. The log's new size is the distance
  // from the pointer to the bottom (or right) edge of the window, kept within limits.
  function resizeLog(pointer: { x: number; y: number }) {
    const area = workspace.current!.getBoundingClientRect()
    if (dock === 'bottom') {
      const height = Math.min(Math.max(area.bottom - pointer.y, 80), area.height * 0.8)
      setLogSize({ ...logSize, bottom: Math.round(height) })
    } else {
      const width = Math.min(Math.max(area.right - pointer.x, 240), area.width * 0.7)
      setLogSize({ ...logSize, right: Math.round(width) })
    }
  }

  // Changes since the last save. A ref, not state, because changing it should
  // not redraw the screen; it only tells the autosave whether to run.
  const dirty = useRef(false)
  const fileNameRef = useRef<string | null>(null)
  fileNameRef.current = fileName

  // Autosave: wait until there has been no change for half a second, then save.
  useEffect(() => {
    if (!character || !dirty.current) return
    setSaveStatus('unsaved')
    const timer = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        const saved = await window.api.saveCharacter(character, fileNameRef.current)
        dirty.current = false
        setFileName(saved)
        setSaveStatus('saved')
      } catch (error) {
        setSaveStatus({ error: (error as Error).message })
      }
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [character])

  function update(change: (draft: CharacterFile) => void) {
    setCharacter((previous) => {
      if (!previous) return previous
      const draft = structuredClone(previous)
      change(draft)
      return draft
    })
    dirty.current = true
  }

  const [toast, setToast] = useState<RollEntry | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function addRoll(entry: RollEntry) {
    setRolls((previous) => [entry, ...previous].slice(0, 100))
    setToast(entry)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  function rollD20(label: string, bonus: number, event?: MouseEvent) {
    const mode: RollMode = event?.shiftKey ? 'advantage' : event?.ctrlKey ? 'disadvantage' : rollMode
    // 2024 Exhaustion: every D20 Test is reduced by 2 per level.
    const penalty = character ? exhaustionRollPenalty(character.state.exhaustion) : 0
    addRoll(d20Entry(penalty ? `${label} (Exhaustion -${penalty})` : label, bonus - penalty, mode))
  }

  function rollDice(label: string, expression: string, critical = false): number | null {
    const entry = diceEntry(label, expression, critical)
    if (!entry) {
      setMessage(`Can't roll "${expression}". Damage should look like 1d8, 2d6+1 or 1d10+1d6.`)
      return null
    }
    addRoll(entry)
    return entry.total
  }

  async function open(name: string) {
    const result = await window.api.loadCharacter(name)
    if (!result.ok) {
      setMessage(`Could not open ${name}: ${result.error}`)
      return
    }
    dirty.current = false
    setCharacter(result.character)
    setFileName(name)
    setSaveStatus('saved')
    setShowPicker(false)
    setEditing(false)
  }

  function createNew() {
    const blank = createBlankCharacter()
    dirty.current = true // save straight away so it appears in the list
    setCharacter(blank)
    setFileName(null)
    setShowPicker(false)
    setEditing(true)
  }

  // Import and Export open Windows file dialogs through the main process.
  // Any failure is shown in the message bar rather than failing silently.
  async function importFile() {
    try {
      const result = await window.api.importCharacter()
      if (!result) return // dialog cancelled
      if ('error' in result) {
        setMessage(`Import failed: ${result.error}`)
        return
      }
      await open(result.fileName)
      setMessage(
        result.copied
          ? 'That character is already in your folder, so it was imported as a separate copy with "(copy)" after its name.'
          : `Imported ${result.fileName}.`
      )
    } catch (error) {
      setMessage(`Import failed: ${(error as Error).message}`)
    }
  }

  async function exportFile() {
    if (!character) return
    try {
      const path = await window.api.exportCharacter(character)
      if (path) setMessage(`Exported to ${path}`)
    } catch (error) {
      setMessage(`Export failed: ${(error as Error).message}`)
    }
  }

  const context: SheetContextValue | null = character && { character, update, editing, rollD20, rollDice }

  const rollLog = (
    <RollLog
      entries={rolls}
      mode={rollMode}
      onModeChange={setRollMode}
      onClear={() => setRolls([])}
      dock={dock}
      onDockChange={setDock}
      collapsed={logCollapsed}
      onCollapsedChange={setLogCollapsed}
    />
  )

  return (
    <div className="app">
      {showEditor && <ContentEditor onClose={() => setShowEditor(false)} />}
      {showParty && !PLAYER_EDITION && <Suspense fallback={null}><PartyView onClose={() => setShowParty(false)} /></Suspense>}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} onChanged={refreshRole} />}
      <header className="toolbar">
        <strong className="app-name">DnD Character Manager</strong>
        <button onClick={() => setShowPicker(true)}>Characters</button>
        <button onClick={exportFile} disabled={!character}>Export</button>
        <button onClick={importFile}>Import</button>
        <button className={showWiki ? 'active' : ''} onClick={() => { setShowWiki(!showWiki); setShowEncounters(false); setShowSound(false) }} title="Your story notes and the party wiki">Wiki</button>
        {role === 'dm' && !PLAYER_EDITION && <button className={showEncounters ? 'active' : ''} onClick={() => { setShowEncounters(!showEncounters); setShowWiki(false); setShowSound(false) }} title="The party's health and the enemies in the fight">Encounters</button>}
        {role === 'dm' && !PLAYER_EDITION && <button className={showSound ? 'active' : ''} onClick={() => { setShowSound(!showSound); setShowWiki(false); setShowEncounters(false) }} title="Sound effects, ambience and music">Sound</button>}
        {role === 'dm' && !PLAYER_EDITION && <button onClick={() => setShowParty(true)} title="All party sheets at a glance (read-only)">DM view</button>}
        <button onClick={() => setShowSettings(true)}>Settings</button>
        <button onClick={() => setShowEditor(true)} title="Correct imported entries or add your own spells, feats, items and more">Content editor</button>
        <button className={editing ? 'active' : ''} disabled={!character} onClick={() => setEditing(!editing)}>
          {editing ? 'Done editing' : 'Edit sheet'}
        </button>
        <span className="save-status">
          {character &&
            (typeof saveStatus === 'object'
              ? <span className="warning">Save failed: {saveStatus.error}</span>
              : saveStatus === 'saved' ? 'All changes saved' : 'Saving…')}
        </span>
      </header>

      {toast && (
        <div className="roll-toast" role="status" onClick={() => setToast(null)}>
          <span className={`roll-toast-total ${rollClass(toast)}`}>{rollText(toast)}</span>
          <span className="roll-toast-text">
            <strong>{toast.label}</strong>
            <span className="muted">{toast.detail}</span>
          </span>
        </div>
      )}

      {message && (
        <div className="message" role="status">
          {message}
          <button className="small" onClick={() => setMessage(null)}>Dismiss</button>
        </div>
      )}

      {showSound && role === 'dm' && !PLAYER_EDITION ? <Suspense fallback={null}><SoundboardTab /></Suspense> : showEncounters && role === 'dm' && !PLAYER_EDITION ? <Suspense fallback={null}><EncountersTab /></Suspense> : showWiki ? <WikiView onClose={() => setShowWiki(false)} /> : (
      <div ref={workspace} className={`workspace dock-${dock}`}>
        <main className="main">
          {context ? (
            <SheetContext.Provider value={context}>
              <Sheet />
            </SheetContext.Provider>
          ) : (
            !showPicker && <p className="muted">No character open.</p>
          )}
        </main>

        {dock === 'window' ? (
          <PopoutWindow title="Roll Log" onClose={() => setDock('bottom')}>
            {rollLog}
          </PopoutWindow>
        ) : (
          <>
            {!logCollapsed && <ResizeHandle direction={dock === 'bottom' ? 'vertical' : 'horizontal'} onResize={resizeLog} />}
            <div
              className="log-slot"
              style={logCollapsed ? undefined : dock === 'bottom' ? { height: logSize.bottom } : { width: logSize.right }}
            >
              {rollLog}
            </div>
          </>
        )}
      </div>
      )}

      {showPicker && (
        <CharacterPicker
          currentFileName={fileName}
          onOpen={open}
          onNew={createNew}
          onImport={importFile}
          onClose={character ? () => setShowPicker(false) : undefined}
        />
      )}
    </div>
  )
}
