// The roll log along the bottom of the window, with the advantage switch.

import type { RollMode } from '../../shared/rules/dice'
import type { RollEntry } from './rolls'

export function RollLog(props: { entries: RollEntry[]; mode: RollMode; onModeChange: (mode: RollMode) => void; onClear: () => void }) {
  const { entries, mode, onModeChange, onClear } = props
  return (
    <div className="roll-log">
      <div className="roll-controls">
        <span className="small-label">d20 rolls</span>
        {(['normal', 'advantage', 'disadvantage'] as RollMode[]).map((m) => (
          <button key={m} className={`small ${mode === m ? 'active' : ''}`} onClick={() => onModeChange(m)}>
            {m === 'normal' ? 'Normal' : m === 'advantage' ? 'Advantage' : 'Disadvantage'}
          </button>
        ))}
        <span className="muted small">Shift-click: advantage. Ctrl-click: disadvantage.</span>
        <button className="small" onClick={onClear} disabled={entries.length === 0}>Clear log</button>
      </div>
      <ol className="roll-entries">
        {entries.length === 0 && <li className="muted">Click any bonus on the sheet to roll it.</li>}
        {entries.map((entry) => (
          <li key={entry.id} className={entry.natural ?? ''}>
            <span className="roll-total">{entry.total}</span>
            <span className="roll-label">{entry.label}</span>
            <span className="muted">{entry.detail}</span>
            {entry.natural === 'nat20' && <span className="badge good">Natural 20</span>}
            {entry.natural === 'nat1' && <span className="badge danger">Natural 1</span>}
            <span className="muted small roll-time">{entry.time}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
