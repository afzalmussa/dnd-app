// The roll log, with the advantage switch and controls for where it sits:
// docked at the bottom, docked on the right, or in its own window.

import type { RollMode } from '../../shared/rules/dice'
import type { RollEntry } from './rolls'

export type DockPosition = 'bottom' | 'right' | 'window'

export function RollLog(props: {
  entries: RollEntry[]
  mode: RollMode
  onModeChange: (mode: RollMode) => void
  onClear: () => void
  dock: DockPosition
  onDockChange: (dock: DockPosition) => void
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}) {
  const { entries, mode, onModeChange, onClear, dock, onDockChange, collapsed, onCollapsedChange } = props
  return (
    <div className={`roll-log dock-${dock}`}>
      <div className="roll-controls">
        <span className="box-label">Roll Log</span>
        <div className="roll-modes">
          {(['normal', 'advantage', 'disadvantage'] as RollMode[]).map((m) => (
            <button key={m} className={`small ${mode === m ? 'active' : ''}`} onClick={() => onModeChange(m)}>
              {m === 'normal' ? 'Normal' : m === 'advantage' ? 'Advantage' : 'Disadvantage'}
            </button>
          ))}
        </div>
        <span className="muted small hint">Shift-click: advantage. Ctrl-click: disadvantage.</span>
        <div className="dock-buttons">
          <button className="small" onClick={onClear} disabled={entries.length === 0}>Clear</button>
          {dock !== 'window' && (
            <button className="small" title={collapsed ? 'Show the log' : 'Shrink to this bar'} onClick={() => onCollapsedChange(!collapsed)}>
              {collapsed ? 'Expand' : 'Collapse'}
            </button>
          )}
          <button className={`small ${dock === 'bottom' ? 'active' : ''}`} title="Dock at the bottom" onClick={() => onDockChange('bottom')}>
            Bottom
          </button>
          <button className={`small ${dock === 'right' ? 'active' : ''}`} title="Dock on the right" onClick={() => onDockChange('right')}>
            Side
          </button>
          <button className={`small ${dock === 'window' ? 'active' : ''}`} title="Open in its own window" onClick={() => onDockChange('window')}>
            Pop out
          </button>
        </div>
      </div>
      {!(collapsed && dock !== 'window') && (
        <ol className="roll-entries">
          {entries.length === 0 && <li className="muted">Click any bonus on the sheet to roll it.</li>}
          {entries.map((entry) => (
            <li key={entry.id} className={entry.natural ?? ''}>
              <span className="roll-total">{entry.total}</span>
              <span className="roll-label">{entry.label}</span>
              <span className="muted roll-detail">{entry.detail}</span>
              {entry.natural === 'nat20' && <span className="badge good">Natural 20</span>}
              {entry.natural === 'nat1' && <span className="badge danger">Natural 1</span>}
              <span className="muted small roll-time">{entry.time}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
