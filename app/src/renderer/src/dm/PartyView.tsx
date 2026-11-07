// DM view: every party sheet at a glance. Read-only; it never changes a character file.

import { useEffect, useState } from 'react'
import type { Campaign } from '../../../shared/api'
import { formatGameTime } from '../../../shared/rules/effects'
import type { PartyMember } from '../../../shared/rules/party'
import { NumberInput } from '../common/Inputs'

export function PartyView({ onClose }: { onClose: () => void }) {
  const [party, setParty] = useState<PartyMember[]>([])
  const [folder, setFolder] = useState('')
  const [role, setRole] = useState<'player' | 'dm'>('player')
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [minutes, setMinutes] = useState<number | null>(60)
  const [error, setError] = useState('')

  async function refresh() {
    try {
      const [members, settings, clock] = await Promise.all([window.api.listParty(), window.api.getSettings(), window.api.getCampaign()])
      setParty(members)
      setFolder(settings.dmFolder)
      setRole(settings.role)
      setCampaign(clock)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    void refresh()
    const timer = setInterval(refresh, 5000) // sheets change during play
    return () => clearInterval(timer)
  }, [])

  async function changeFolder() {
    const next = await window.api.chooseFolder('dmFolder')
    if (next) void refresh()
  }

  async function moveClock(newMinutes: number) {
    try {
      await window.api.setCampaign({ gameMinutes: Math.max(0, newMinutes) })
      setError('')
      void refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal levelup party-view">
        <header>
          <h2>DM view: the party</h2>
          <button className="small" onClick={changeFolder}>Choose folder…</button>
          <button className="small" onClick={refresh}>Refresh</button>
          <button className="small" onClick={onClose}>Close</button>
        </header>
        <p className="muted small">Reading sheets from <code>{folder}</code> (read-only, refreshes every 5 seconds).</p>
        <div className="play-controls">
          <span className="small-label">Campaign clock</span>
          <strong>{campaign ? formatGameTime(campaign.gameMinutes) : 'not set'}</strong>
          {role === 'dm' ? (
            <>
              <NumberInput value={minutes} min={0} onChange={setMinutes} />
              <span className="muted small">min</span>
              <button className="small" onClick={() => moveClock((campaign?.gameMinutes ?? 0) + (minutes ?? 0))}>Advance</button>
              <button className="small" onClick={() => moveClock(0)} title="Back to Day 1, 00:00">Reset</button>
            </>
          ) : <span className="muted small">Set this PC as the DM in Settings to move the clock.</span>}
        </div>
        {error && <p className="error">{error}</p>}
        <section>
          {party.length === 0 && <p className="muted">No character files found in that folder.</p>}
          <table className="party-table">
            <thead>
              <tr><th>Character</th><th>Class</th><th>HP</th><th>AC</th><th>Passive Perc.</th><th>Init.</th><th>Speed</th><th>Spell slots left</th><th>Resources</th><th>Conditions and effects</th></tr>
            </thead>
            <tbody>
              {party.map((m) => m.readable ? (
                <tr key={m.fileName}>
                  <td><strong>{m.name}</strong><div className="muted small">{m.player}</div></td>
                  <td>{m.classLabel}</td>
                  <td className={m.hp.max > 0 && m.hp.current <= m.hp.max / 4 ? 'low' : ''}>
                    {m.hp.current}/{m.hp.max}{m.hp.temp > 0 && <span className="muted"> +{m.hp.temp} temp</span>}
                  </td>
                  <td>{m.armorClass}</td>
                  <td>{m.passivePerception}</td>
                  <td>{m.initiative >= 0 ? `+${m.initiative}` : m.initiative}</td>
                  <td>{m.speed ?? '?'} ft</td>
                  <td>{m.slots.length === 0 ? '–' : m.slots.map((s) => `L${s.level}: ${s.left}/${s.max}`).join('  ')}</td>
                  <td>{m.resources.length === 0 ? '–' : m.resources.map((r) => <div key={r.name}>{r.name} {r.left}/{r.max}</div>)}</td>
                  <td>
                    {[...m.conditions, ...(m.exhaustion ? [`Exhaustion ${m.exhaustion}`] : []), ...m.activeEffects, ...(m.inspiration ? ['Heroic Inspiration'] : [])].join(', ') || '–'}
                  </td>
                </tr>
              ) : (
                <tr key={m.fileName}><td>{m.fileName}</td><td colSpan={9} className="error">{m.error}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
