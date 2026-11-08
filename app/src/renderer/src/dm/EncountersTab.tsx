// The DM's Encounters tab: the party's live health and battle numbers, and the enemies in the fight.
// One compact line per creature. Enemy abilities are chips; hover one to read what it does.
// There are no roll buttons: the DM rolls their own dice.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { CONDITIONS } from '../../../shared/coreRules'
import {
  addMonsters, addPlayer, changeHp, emptyEncounter, nextTurn, removeCombatant, totalXp, turnOrder,
  type Combatant, type EncounterState, type MonsterStats
} from '../../../shared/rules/encounter'
import type { PartyMember } from '../../../shared/rules/party'
import { NumberInput } from '../common/Inputs'
import { useStoredState } from '../storedState'

const SECTION_TITLES: Record<string, string> = { traits: 'Trait', actions: 'Action', bonusActions: 'Bonus action', reactions: 'Reaction', legendaryActions: 'Legendary' }
const SECTION_ORDER = ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions']

function crValue(cr: string | null): number {
  if (!cr) return -1
  return cr.includes('/') ? Number(cr.split('/')[0]) / Number(cr.split('/')[1]) : Number(cr)
}

function passive(senses: string | null): string {
  return senses?.match(/Passive Perception (\d+)/)?.[1] ?? '–'
}

// A chip for each ability; the description appears on hover so it takes no room on the page.
// The description is drawn at a fixed screen position beside the chip, so the table never cuts it off:
// below the chip, or above it when there is no room below, and kept inside the window sideways.
function AbilityChips({ m }: { m: MonsterStats }) {
  const [tip, setTip] = useState<{ key: string; name: string; kind: string; text: string; style: CSSProperties } | null>(null)
  function show(e: ReactMouseEvent<HTMLElement>, key: string, name: string, kind: string, text: string) {
    const r = e.currentTarget.getBoundingClientRect()
    const width = Math.min(416, window.innerWidth - 16)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    const below = window.innerHeight - r.bottom
    const style: CSSProperties = below >= 260 || below >= r.top ? { left, top: r.bottom + 4, width, maxHeight: Math.max(120, below - 12) } : { left, bottom: window.innerHeight - r.top + 4, width, maxHeight: Math.max(120, r.top - 12) }
    setTip({ key, name, kind, text, style })
  }
  return (
    <span className="ability-chips">
      {SECTION_ORDER.flatMap((key) => (m.sections[key] ?? []).filter((e) => e.name).map((e, i) => (
        <span key={`${key}${i}`} className={`ability-chip kind-${key}`}
          onMouseEnter={(ev) => show(ev, `${key}${i}`, e.name, SECTION_TITLES[key], e.text)} onMouseLeave={() => setTip(null)}>
          {e.name}
        </span>
      )))}
      {tip && (
        <span className="ability-popup" role="tooltip" style={tip.style}>
          <strong>{tip.name}</strong> <span className="muted small">{tip.kind}</span>
          <span className="ability-text">{tip.text}</span>
        </span>
      )}
    </span>
  )
}

// A search box that suggests monsters as you type; picking one adds it.
function EnemyPicker({ monsters, onPick }: { monsters: MonsterStats[]; onPick: (m: MonsterStats, count: number) => void }) {
  const [query, setQuery] = useState('')
  const [count, setCount] = useState<number | null>(1)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const matches = useMemo(() => {
    // Every word typed must appear somewhere in the name, type or "cr N", in any order: "adult dragon" finds "Adult Red Dragon".
    const q = query.trim().toLowerCase()
    const words = q.split(/\s+/).filter(Boolean)
    const crQuery = q.match(/^cr\s*(\S+)$/)?.[1]
    return monsters
      .filter((m) => {
        if (crQuery) return String(m.cr) === crQuery
        const hay = `${m.name} ${m.creatureType} ${m.size}`.toLowerCase()
        return words.every((w) => hay.includes(w))
      })
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || crValue(a.cr) - crValue(b.cr) || a.name.localeCompare(b.name))
  }, [monsters, query])
  // The list is fixed to the screen under the search box, so no part of the page can cut it off.
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  function place() {
    const r = box.current?.querySelector('input')?.getBoundingClientRect()
    if (r) setMenuStyle({ left: r.left, top: r.bottom + 4, maxHeight: window.innerHeight - r.bottom - 16 })
  }
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  return (
    <div className="enemy-picker" ref={box}>
      <input type="text" className="text-input" placeholder="Add enemy: type a name, type or 'cr 5'…" value={query}
        onFocus={() => { place(); setOpen(true) }} onChange={(e) => { setQuery(e.target.value); place(); setOpen(true) }} />
      <span className="muted small">×</span>
      <NumberInput value={count} min={1} onChange={setCount} />
      {open && matches.length > 0 && (
        <div className="enemy-menu" style={menuStyle}>
          {matches.map((m) => (
            <button key={m.id} className="link-row" onClick={() => { onPick(m, Math.max(1, count ?? 1)); setQuery(''); setOpen(false) }}>
              <span className="chip">CR {m.cr}</span> {m.name} <span className="muted small">{m.creatureType} · AC {m.ac} · HP {m.hp?.average}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function EncountersTab() {
  const [monsters, setMonsters] = useState<MonsterStats[]>([])
  const [party, setParty] = useState<PartyMember[]>([])
  const [state, setState] = useStoredState<EncounterState>('encounter', emptyEncounter())
  const [amounts, setAmounts] = useState<Record<string, number | null>>({})

  useEffect(() => { void window.api.listMonsters().then((l) => setMonsters(l as MonsterStats[])).catch(() => setMonsters([])) }, [])
  useEffect(() => {
    let stop = false
    const load = () => window.api.listParty().then((p) => { if (!stop) setParty(p.filter((x) => x.readable)) }).catch(() => undefined)
    void load()
    const timer = setInterval(load, 5000) // the sheets change as the players play
    return () => { stop = true; clearInterval(timer) }
  }, [])

  const byId = useMemo(() => new Map(monsters.map((m) => [m.id, m])), [monsters])
  const live = useMemo(() => new Map(party.map((p) => [p.name, p])), [party])

  // Every party member is in the fight; only their initiative is typed here.
  useEffect(() => {
    let next = state
    for (const p of party) if (!next.combatants.some((c) => c.player && c.name === p.name)) next = addPlayer(next, p.name, null, p.hp.max, p.armorClass)
    if (next !== state) setState(next)
  }, [party])

  const order = turnOrder(state)
  const current = order[state.turn]
  const edit = (id: string, change: (c: Combatant) => Combatant) => setState({ ...state, combatants: state.combatants.map((c) => (c.id === id ? change(c) : c)) })

  function playerRow(c: Combatant, active: boolean) {
    const p = live.get(c.name)
    const pct = p && p.hp.max > 0 ? Math.max(0, Math.min(100, (p.hp.current / p.hp.max) * 100)) : 0
    return (
      <tr key={c.id} className={`pc ${active ? 'current' : ''}`}>
        <td><NumberInput value={c.initiative} placeholder="Init" onChange={(v) => edit(c.id, (x) => ({ ...x, initiative: v }))} /></td>
        <td className="who"><strong>{c.name}</strong> <span className="chip">PC</span><div className="muted small">{p?.classLabel ?? 'not in the DM folder'}</div></td>
        <td className="hp">
          {p ? <><strong className={pct <= 25 ? 'low' : ''}>{p.hp.current}</strong>/{p.hp.max}{p.hp.temp > 0 && <span className="muted"> +{p.hp.temp}</span>}
            <div className="hpbar"><div style={{ width: `${pct}%` }} /></div></> : '–'}
        </td>
        <td className="line">
          {p ? <>
            AC {p.armorClass} · Init {p.initiative >= 0 ? '+' : ''}{p.initiative} · Passive Perc. {p.passivePerception} · Speed {p.speed ?? '?'} ft
            {p.slots.length > 0 && <> · Slots {p.slots.map((s) => `${s.left}/${s.max}`).join(' ')}</>}
            {p.resources.map((r) => <span key={r.name}> · {r.name} {r.left}/{r.max}</span>)}
            {[...p.conditions, ...(p.exhaustion ? [`Exhaustion ${p.exhaustion}`] : []), ...p.activeEffects].map((k) => <span key={k} className="chip warn">{k}</span>)}
          </> : null}
        </td>
        <td><button className="small danger" title="Remove from this fight" onClick={() => setState(removeCombatant(state, c.id))}>×</button></td>
      </tr>
    )
  }

  function enemyRow(c: Combatant, active: boolean) {
    const m = byId.get(c.monsterId ?? '')
    const pct = c.hpMax > 0 ? (c.hp / c.hpMax) * 100 : 0
    return (
      <tr key={c.id} className={`enemy ${active ? 'current' : ''} ${c.hp === 0 ? 'down' : ''}`}>
        <td><NumberInput value={c.initiative} placeholder="Init" onChange={(v) => edit(c.id, (x) => ({ ...x, initiative: v }))} /></td>
        <td className="who"><strong>{c.name}</strong><div className="muted small">{m ? `${m.size} ${m.creatureType}` : ''}</div></td>
        <td className="hp">
          <strong className={pct <= 25 ? 'low' : ''}>{c.hp}</strong>/{c.hpMax}
          <div className="hpbar enemy"><div style={{ width: `${pct}%` }} /></div>
          <div className="hp-controls">
            <NumberInput value={amounts[c.id] ?? null} min={0} placeholder="amount" onChange={(v) => setAmounts({ ...amounts, [c.id]: v })} />
            <button className="small danger" onClick={() => { setState(changeHp(state, c.id, -(amounts[c.id] ?? 0))); setAmounts({ ...amounts, [c.id]: null }) }}>Dmg</button>
            <button className="small good" onClick={() => { setState(changeHp(state, c.id, amounts[c.id] ?? 0)); setAmounts({ ...amounts, [c.id]: null }) }}>Heal</button>
          </div>
        </td>
        <td className="line">
          {m && <>AC {m.ac} · Init {m.initiative ? (m.initiative.bonus >= 0 ? '+' : '') + m.initiative.bonus : '–'} · Passive Perc. {passive(m.senses)} · Speed {m.speed} · CR {m.cr}
            {m.resistances && <span className="muted"> · Resists {m.resistances}</span>}
            {m.immunities && <span className="muted"> · Immune {m.immunities}</span>}
            {m.vulnerabilities && <span className="muted"> · Vuln. {m.vulnerabilities}</span>}</>}
          <div>
            {c.conditions.map((k) => <span key={k} className="chip warn" title="Click to remove" onClick={() => edit(c.id, (x) => ({ ...x, conditions: x.conditions.filter((y) => y !== k) }))}>{k} ×</span>)}
            <select value="" onChange={(e) => e.target.value && edit(c.id, (x) => ({ ...x, conditions: [...x.conditions, e.target.value] }))}>
              <option value="">+ condition</option>
              {CONDITIONS.filter((k) => !c.conditions.includes(k)).map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>
          {m && <AbilityChips m={m} />}
        </td>
        <td><button className="small danger" title="Remove" onClick={() => setState(removeCombatant(state, c.id))}>×</button></td>
      </tr>
    )
  }

  return (
    <div className="encounters">
      <div className="encounters-bar">
        <strong>Round {state.round}</strong>
        <button className="primary small" disabled={order.length === 0} onClick={() => setState(nextTurn(state))}>Next turn</button>
        {current && <span className="small">Now: <strong>{current.name}</strong></span>}
        <EnemyPicker monsters={monsters} onPick={(m, n) => setState(addMonsters(state, m, n))} />
        <span className="small"><b>Total XP</b> {totalXp(state).toLocaleString()}</span>
        <button className="small danger" onClick={() => { if (confirm('Remove all enemies and reset the round?')) setState({ ...emptyEncounter(), combatants: state.combatants.filter((c) => c.player).map((c) => ({ ...c, initiative: null })) }) }}>Clear enemies</button>
      </div>
      {monsters.length === 0 && <p className="warning small">No monsters found. Run the Monster Manual import (README).</p>}
      <table className="encounter-table">
        <thead><tr><th>Init</th><th>Who</th><th>Health</th><th>Battle line and abilities (hover an ability for what it does)</th><th /></tr></thead>
        <tbody>{order.map((c, i) => (c.player ? playerRow(c, i === state.turn) : enemyRow(c, i === state.turn)))}</tbody>
      </table>
    </div>
  )
}
