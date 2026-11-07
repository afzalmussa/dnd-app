// Spells tab: spellcasting ability, save DC, attack bonus, slots and the spell list.

import { newId } from '../../../shared/character'
import { ABILITIES } from '../../../shared/coreRules'
import { formatBonus } from '../../../shared/rules/abilities'
import { spellAttackBonus, spellSaveDC } from '../../../shared/rules/spellcasting'
import type { Ability } from '../../../shared/schema/character'
import { NumberInput, Section, TextInput, UsesTracker } from '../common/Inputs'
import { useSheet } from '../SheetContext'

const LEVEL_NAMES = ['Cantrips', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

export function SpellsTab() {
  const { character, update, editing, rollD20 } = useSheet()
  const casting = character.spellcasting
  const dc = spellSaveDC(character)
  const attack = spellAttackBonus(character)
  const hasSlots = casting.slotsMax.some((n) => n > 0)

  return (
    <div className="tab-body">
      <Section title="Spellcasting">
        <div className="spell-header">
          <label>
            Ability
            <select
              value={casting.ability ?? ''}
              onChange={(e) => update((c) => { c.spellcasting.ability = (e.target.value || null) as Ability | null })}
            >
              <option value="">None</option>
              {ABILITIES.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <div className="stat">
            <span className="small-label">Save DC</span>
            <span className="stat-value">{dc ?? '–'}</span>
          </div>
          <button className="stat clickable" disabled={attack === null} onClick={(e) => attack !== null && rollD20('Spell attack', attack, e)}>
            <span className="small-label">Spell attack</span>
            <span className="stat-value">{attack === null ? '–' : formatBonus(attack)}</span>
          </button>
        </div>
      </Section>

      <Section title="Spell Slots">
        {!hasSlots && !editing && <p className="muted">No spell slots. Use Edit sheet to set them.</p>}
        <div className="slots">
          {casting.slotsMax.map((max, i) =>
            editing ? (
              <label key={i} className="slot-edit">
                {LEVEL_NAMES[i + 1]}
                <NumberInput value={max} min={0} onChange={(v) => update((c) => { c.spellcasting.slotsMax[i] = Math.max(0, v ?? 0) })} />
              </label>
            ) : max > 0 ? (
              <div className="slot-row" key={i}>
                <span className="slot-level">{LEVEL_NAMES[i + 1]}</span>
                <UsesTracker
                  max={max}
                  used={Math.min(character.state.spellSlotsUsed[i] ?? 0, max)}
                  onChange={(used) => update((c) => { c.state.spellSlotsUsed[i] = used })}
                />
              </div>
            ) : null
          )}
        </div>
      </Section>

      <Section
        title={`Spells (${character.spells.filter((s) => s.prepared && s.level > 0).length} prepared)`}
        actions={
          editing && (
            <button
              className="small"
              onClick={() => update((c) => { c.spells.push({ id: newId(), spellId: null, name: 'New spell', level: 1, prepared: false, notes: '' }) })}
            >
              Add spell
            </button>
          )
        }
      >
        {character.spells.length === 0 && <p className="muted">No spells. The spell list fills from the imported books in a later milestone.</p>}
        {LEVEL_NAMES.map((levelName, level) => {
          const spells = character.spells.filter((s) => s.level === level)
          if (spells.length === 0) return null
          return (
            <div className="spell-group" key={level}>
              <div className="small-label">{levelName}</div>
              {spells.map((spell) => {
                const index = character.spells.findIndex((s) => s.id === spell.id)
                return editing ? (
                  <div className="spell-row" key={spell.id}>
                    <TextInput value={spell.name} onChange={(v) => update((c) => { c.spells[index].name = v })} />
                    <select value={spell.level} onChange={(e) => update((c) => { c.spells[index].level = Number(e.target.value) })}>
                      {LEVEL_NAMES.map((n, l) => <option key={l} value={l}>{n}</option>)}
                    </select>
                    <TextInput value={spell.notes} placeholder="Notes" onChange={(v) => update((c) => { c.spells[index].notes = v })} />
                    <button className="small danger" onClick={() => update((c) => { c.spells.splice(index, 1) })}>Remove</button>
                  </div>
                ) : (
                  <div className="spell-row" key={spell.id}>
                    {level > 0 && (
                      <input
                        type="checkbox"
                        title="Prepared"
                        checked={spell.prepared}
                        onChange={(e) => update((c) => { c.spells[index].prepared = e.target.checked })}
                      />
                    )}
                    <span>{spell.name}</span>
                    <span className="muted">{spell.notes}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </Section>
    </div>
  )
}
