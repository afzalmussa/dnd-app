// Notes tab: free text, always editable.

import { Section } from '../common/Inputs'
import { useSheet } from '../SheetContext'

const TITLES: Record<string, string> = { general: 'Session Notes', backstory: 'Backstory', allies: 'Allies and Organisations' }

export function NotesTab() {
  const { character, update } = useSheet()
  return (
    <div className="tab-body">
      {Object.keys(character.notes).map((key) => (
        <Section title={TITLES[key] ?? key} key={key}>
          <textarea
            className="notes"
            rows={8}
            value={character.notes[key]}
            onChange={(e) => update((c) => { c.notes[key] = e.target.value })}
          />
        </Section>
      ))}
    </div>
  )
}
