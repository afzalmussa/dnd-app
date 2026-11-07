// DM encounter tools: browse the Monster Manual, read a stat block, and run the fight (initiative, hit
// points, conditions, rounds and the XP total). The encounter is remembered on this PC between sessions.

import { useEffect, useMemo, useState } from 'react'
import { CONDITIONS } from '../../../shared/coreRules'
import {
  addMonsters, addPlayer, changeHp, emptyEncounter, nextTurn, removeCombatant, rollInitiative, totalXp, turnOrder,
  type Combatant, type EncounterState, type MonsterStats
} from '../../../shared/rules/encounter'
import { NumberInput } from '../common/Inputs'
import { useStoredState } from '../storedState'

const ABILITY_NAMES = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const SECTION_TITLES: Record<string, string> = { traits: 'Traits', actions: 'Actions', bonusActions: 'Bonus Actions', reactions: 'Reactions', legendaryActions: 'Legendary Actions' }

function crValue(cr: string | null): number {
  if (!cr) return -1
  return cr.includes('/') ? Number(cr.split('/')[0]) / Number(cr.split('/')[1]) : Number(cr)
}

function StatBlock({ m }: { m: MonsterStats }) {
  const sign = (n: number) => (n >= 0 ? `+${n}` : String(n))
  return (
    <div className="stat-block">
      <h3>{m.name}</h3>
      <div className="muted small">{m.size} {m.creatureType}, {m.alignment}</div>
      <div><b>AC</b> {m.ac}{m.acNote ? ` (${m.acNote})` : ''} <b>Initiative</b> {m.initiative ? `${sign(m.initiative.bonus)} (${m.initiative.score})` : '–'}</div>
      <div><b>HP</b> {m.hp?.average} {m.hp?.dice && `(${m.hp.dice})`}</div>
      <div><b>Speed</b> {m.speed}</div>
      <table className="ability-table">
        <thead><tr>{ABILITY_NAMES.map((a) => <th key={a}>{a.toUpperCase()}</th>)}</tr></thead>
        <tbody>
          <tr>{ABILITY_NAMES.map((a) => <td key={a}>{m.abilities[a]?.score}</td>)}</tr>
          <tr>{ABILITY_NAMES.map((a) => <td key={a} className="muted">{m.abilities[a] ? `${sign(m.abilities[a].mod)} / save ${sign(m.abilities[a].save)}` : ''}</td>)}</tr>
        </tbody>
      </table>
      {m.skills && <div><b>Skills</b> {m.skills}</div>}
      {m.vulnerabilities && <div><b>Vulnerabilities</b> {m.vulnerabilities}</div>}
      {m.resistances && <div><b>Resistances</b> {m.resistances}</div>}
      {m.immunities && <div><b>Immunities</b> {m.immunities}</div>}
      <div><b>Senses</b> {m.senses}</div>
      <div><b>Languages</b> {m.languages}</div>
      <div><b>CR</b> {m.cr} (XP {m.xp?.toLocaleString()}; PB +{m.pb})</div>
      {Object.entries(m.sections).map(([key, entries]) => (
        <div key={key}>
          <h4>{SECTION_TITLES[key] ?? key}</h4>
          {entries.map((e, i) => <p key={i}>{e.name && <b><i>{e.name}.</i> </b>}{e.text}</p>)}
        </div>
      ))}
      {m.source.flags.length > 0 && <p className="warning small">Import flags: {m.source.flags.join('; ')}. Check page {m.source.page} of the Monster Manual.</p>}
    </div>
  )
}

export function EncounterView({ onClose }: { onClose: () => void }) {
  const [monsters, setMonsters] = useState<MonsterStats[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MonsterStats | null>(null)
  const [count, setCount] = useState<number | null>(1)
  const [state, setState] = useStoredState<EncounterState>('encounter', emptyEncounter())
  const [amounts, setAmounts] = useState<Record<string, number | null>>({})
  const [shownStats, setShownStats] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => { void window.api.listMonsters().then((list) => setMonsters(list as MonsterStats[])).catch(() => setMonsters([])) }, [])
  const byId = useMemo(() => new Map(monsters.map((m) => [m.id, m])), [monsters])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return monsters
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.creatureType.toLowerCase().includes(q) || `cr ${m.cr}` === q)
      .sort((a, b) => crValue(a.cr) - crValue(b.cr) || a.name.localeCompare(b.name))
      .slice(0, 200)
  }, [monsters, search])

  const order = turnOrder(state)
  const current = order[state.turn]
  const initiativeBonus = (c: Combatant) => byId.get(c.monsterId ?? '')?.initiative?.bonus ?? 0

  function update(change: (c: Combatant) => Combatant, id: string) {
    setState({ ...state, combatants: state.combatants.map((c) => (c.id === id ? change(c) : c)) })
  }

  async function addParty() {
    const party = await window.api.listParty()
    let next = state
    for (const p of party) {
      if (p.readable && !next.combatants.some((c) => c.player && c.name === p.name)) next = addPlayer(next, p.name, null, p.hp.max, p.armorClass)
    }
    setState(next)
    setMessage(party.length ? `Added ${party.filter((p) => p.readable).length} party members from the DM folder. Enter their initiative.` : 'No sheets found in the DM folder (Settings).')
  }

  return (
    <div className="modal-backdrop">
      <div className="modal levelup encounter">
        <header>
          <h2>Encounter</h2>
          <span className="muted small">{message}</span>
          <button className="small" onClick={onClose}>Close</button>
        </header>
        {monsters.length === 0 && <p className="warning small">No monsters found. Run the book import for the Monster Manual (README).</p>}
        <div className="encounter-grid">
          <div className="encounter-browser">
            <input type="text" className="text-input" placeholder="Search by name or type, or 'cr 5'…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="encounter-list">
              {shown.map((m) => (
                <button key={m.id} className={`link-row ${selected?.id === m.id ? 'on' : ''}`} onClick={() => setSelected(m)}>
                  <span className="chip">CR {m.cr}</span> {m.name} <span className="muted small">{m.creatureType}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="encounter-detail">
            {!selected && <p className="muted">Pick a monster to read its stat block.</p>}
            {selected && (
              <>
                <div className="encounter-add">
                  <NumberInput value={count} min={1} onChange={setCount} />
                  <button className="primary" onClick={() => setState(addMonsters(state, selected, Math.max(1, count ?? 1)))}>Add to encounter</button>
                </div>
                <StatBlock m={selected} />
              </>
            )}
          </div>
          <div className="encounter-tracker">
            <div className="tracker-bar">
              <strong>Round {state.round}</strong>
              <button className="small" onClick={addParty}>Add party</button>
              <button className="small" onClick={() => setState(rollInitiative(state, initiativeBonus))} title="Rolls d20 + initiative bonus for monsters that have none yet">Roll monster initiative</button>
              <button className="primary small" disabled={order.length === 0} onClick={() => setState(nextTurn(state))}>Next turn</button>
              <button className="small danger" onClick={() => { if (confirm('Clear the whole encounter?')) setState(emptyEncounter()) }}>Clear</button>
            </div>
            {order.length === 0 && <p className="muted">Add monsters from the list, and your party with "Add party".</p>}
            <table className="tracker-table">
              <tbody>
                {order.map((c, i) => (
                  <tr key={c.id} className={`${i === state.turn ? 'current' : ''} ${c.hp === 0 ? 'down' : ''}`}>
                    <td><NumberInput value={c.initiative} placeholder="Init" onChange={(v) => update((x) => ({ ...x, initiative: v }), c.id)} /></td>
                    <td>
                      <button className="link" onClick={() => c.monsterId && setShownStats(shownStats === c.id ? null : c.id)}>{c.name}</button>
                      {c.player && <span className="chip">PC</span>}
                      <div className="muted small">AC {c.ac ?? '?'}{c.xp ? ` · ${c.xp.toLocaleString()} XP` : ''}</div>
                      <div>
                        {c.conditions.map((k) => <span key={k} className="chip" title="Remove" onClick={() => update((x) => ({ ...x, conditions: x.conditions.filter((y) => y !== k) }), c.id)}>{k} ×</span>)}
                        <select value="" onChange={(e) => e.target.value && update((x) => ({ ...x, conditions: [...x.conditions, e.target.value] }), c.id)}>
                          <option value="">+ condition</option>
                          {CONDITIONS.filter((k) => !c.conditions.includes(k)).map((k) => <option key={k}>{k}</option>)}
                        </select>
                      </div>
                    </td>
                    <td>
                      <strong>{c.hp}</strong>/{c.hpMax}
                      <div className="hp-controls">
                        <NumberInput value={amounts[c.id] ?? null} min={0} placeholder="amt" onChange={(v) => setAmounts({ ...amounts, [c.id]: v })} />
                        <button className="small danger" onClick={() => { setState(changeHp(state, c.id, -(amounts[c.id] ?? 0))); setAmounts({ ...amounts, [c.id]: null }) }}>Dmg</button>
                        <button className="small good" onClick={() => { setState(changeHp(state, c.id, amounts[c.id] ?? 0)); setAmounts({ ...amounts, [c.id]: null }) }}>Heal</button>
                      </div>
                    </td>
                    <td><button className="small danger" title="Remove" onClick={() => setState(removeCombatant(state, c.id))}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {current && <p className="small">Now: <strong>{current.name}</strong></p>}
            <p className="small"><b>Total XP:</b> {totalXp(state).toLocaleString()} <span className="muted">(difficulty ratings need the DMG's XP tables, which are not in the data pack)</span></p>
            {shownStats && byId.get(state.combatants.find((c) => c.id === shownStats)?.monsterId ?? '') && (
              <StatBlock m={byId.get(state.combatants.find((c) => c.id === shownStats)!.monsterId!)!} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
