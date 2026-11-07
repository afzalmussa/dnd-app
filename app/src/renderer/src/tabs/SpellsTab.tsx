// Spells tab: spellcasting ability, save DC, attack bonus, slots and the spell list.
// Type a spell name and pick it from the list: the school, casting time, range, components,
// duration and description are copied from the imported book data (if the data pack exists).

import { useEffect, useMemo, useState } from 'react'
import { newId } from '../../../shared/character'
import type { SpellInfo } from '../../../shared/api'
import { ABILITIES } from '../../../shared/coreRules'
import { formatBonus } from '../../../shared/rules/abilities'
import { detailsFromSpell, spellKey } from '../../../shared/rules/spellData'
import { spellAttackBonus, spellSaveDC } from '../../../shared/rules/spellcasting'
import type { Ability, SpellEntry } from '../../../shared/schema/character'
import { NumberInput, Section, TextInput, UsesTracker } from '../common/Inputs'
import { useSheet } from '../SheetContext'

const LEVEL_NAMES = ['Cantrips', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

function SpellDetailsView({ spell }: { spell: SpellEntry }) {
  const d = spell.details
  if (!d) return null
  return (
    <div className="spell-details">
      <div className="spell-facts">
        <span><b>School</b> {d.school}</span>
        <span><b>Casting time</b> {d.castingTime}{d.ritual ? ' (ritual)' : ''}</span>
        <span><b>Range</b> {d.range}</span>
        <span><b>Components</b> {d.components}</span>
        <span><b>Duration</b> {d.duration}</span>
      </div>
      <p>{d.description}</p>
      {d.higherLevels && <p><b>Higher levels.</b> {d.higherLevels}</p>}
      <p className="muted">{d.classes.join(', ')} · {d.source}</p>
    </div>
  )
}

export function SpellsTab() {
  const { character, update, editing, rollD20 } = useSheet()
  const casting = character.spellcasting
  const dc = spellSaveDC(character)
  const attack = spellAttackBonus(character)
  const hasSlots = casting.slotsMax.some((n) => n > 0)
  const [known, setKnown] = useState<SpellInfo[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [quickAdd, setQuickAdd] = useState('')

  useEffect(() => {
    window.api.listSpells().then(setKnown).catch(() => setKnown([]))
  }, [])
  const byKey = useMemo(() => new Map(known.map((s) => [spellKey(s.name), s])), [known])
  // Spells on the character's own class list come first in the suggestions.
  const classNames = character.manualValues.classes.map((c) => c.name.toLowerCase())
  const suggestions = useMemo(
    () => [...known].sort((a, b) => Number(b.classLists.some((c) => classNames.includes(c.toLowerCase()))) - Number(a.classLists.some((c) => classNames.includes(c.toLowerCase()))) || a.name.localeCompare(b.name)),
    [known, classNames.join(',')]
  )

  // Fills a spell entry from the book data when the typed name matches one.
  function applyName(entry: SpellEntry, name: string) {
    entry.name = name
    const match = byKey.get(spellKey(name))
    if (match) {
      entry.spellId = match.id
      entry.level = match.level ?? entry.level
      entry.details = detailsFromSpell(match)
      entry.notes = entry.notes || (match.concentration ? 'Concentration' : '')
    }
  }

  function addByName(name: string) {
    if (!name.trim()) return
    update((c) => {
      const entry: SpellEntry = { id: newId(), spellId: null, name: name.trim(), level: 1, prepared: false, notes: '' }
      applyName(entry, name.trim())
      entry.prepared = entry.level === 0
      c.spells.push(entry)
    })
    setQuickAdd('')
  }

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
          <span className="quick-add">
            <input
              type="text"
              className="text-input"
              list="known-spells"
              value={quickAdd}
              placeholder={known.length ? 'Add a spell: start typing…' : 'Add a spell by name'}
              onChange={(e) => setQuickAdd(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addByName(quickAdd) }}
            />
            <button className="small" onClick={() => addByName(quickAdd)}>Add</button>
          </span>
        }
      >
        <datalist id="known-spells">
          {suggestions.map((s) => <option key={s.id} value={s.name}>{`${s.level === 0 ? 'Cantrip' : `Level ${s.level}`} ${s.school ?? ''}`}</option>)}
        </datalist>
        {known.length === 0 && <p className="muted">The book data was not found, so names are not suggested. Run the book import to enable it.</p>}
        {character.spells.length === 0 && <p className="muted">No spells yet.</p>}
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
                    <input
                      type="text"
                      className="text-input"
                      list="known-spells"
                      value={spell.name}
                      onChange={(e) => update((c) => applyName(c.spells[index], e.target.value))}
                    />
                    <select value={spell.level} onChange={(e) => update((c) => { c.spells[index].level = Number(e.target.value) })}>
                      {LEVEL_NAMES.map((n, l) => <option key={l} value={l}>{n}</option>)}
                    </select>
                    <TextInput value={spell.notes} placeholder="Notes" onChange={(v) => update((c) => { c.spells[index].notes = v })} />
                    <button className="small danger" onClick={() => update((c) => { c.spells.splice(index, 1) })}>Remove</button>
                  </div>
                ) : (
                  <div className="spell-block" key={spell.id}>
                    <div className="spell-row">
                      {level > 0 && (
                        <input
                          type="checkbox"
                          title="Prepared"
                          checked={spell.prepared}
                          onChange={(e) => update((c) => { c.spells[index].prepared = e.target.checked })}
                        />
                      )}
                      <button className="link" onClick={() => setOpen(open === spell.id ? null : spell.id)}>{spell.name}</button>
                      {spell.details && (
                        <span className="muted spell-summary">
                          {spell.details.castingTime} · {spell.details.range} · {spell.details.components} · {spell.details.duration}
                        </span>
                      )}
                      <span className="muted">{spell.notes}</span>
                    </div>
                    {open === spell.id && <SpellDetailsView spell={spell} />}
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
