// Level-up wizard: guides the player through everything a new level changes.
// Steps: class, hit points, what you gain, your choices, review. Options come from the imported
// book data (the data pack); the rules are in shared/rules/levelUp.ts.

import { useEffect, useMemo, useState } from 'react'
import { ABILITIES } from '../../../shared/coreRules'
import { mod } from '../../../shared/rules/abilities'
import {
  applyLevelUp, missingChoices, planLevelUp,
  type ClassData, type LevelUpChoices, type Requirement, type RulesData, type SubclassData
} from '../../../shared/rules/levelUp'
import type { Ability } from '../../../shared/schema/character'
import { useSheet } from '../SheetContext'

const STEPS = ['Class', 'Hit points', 'What you gain', 'Your choices', 'Review']

function PickList(props: { options: { id: string; label: string; detail?: string }[]; count: number; value: string[]; onChange: (v: string[]) => void }) {
  const [filter, setFilter] = useState('')
  const shown = props.options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div className="pick-list">
      <input type="text" className="text-input" placeholder="Type to filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="pick-count">{props.value.length}/{props.count} chosen</div>
      <div className="pick-options">
        {shown.map((o) => {
          const on = props.value.includes(o.id)
          const full = props.value.length >= props.count && !on
          return (
            <label key={o.id} className={`pick-option ${on ? 'on' : ''}`} title={o.detail}>
              <input
                type={props.count === 1 ? 'radio' : 'checkbox'}
                checked={on}
                disabled={full && props.count > 1}
                onChange={() => props.onChange(props.count === 1 ? [o.id] : on ? props.value.filter((x) => x !== o.id) : [...props.value, o.id])}
              />
              {o.label}
            </label>
          )
        })}
      </div>
    </div>
  )
}

export function LevelUpWizard({ onClose }: { onClose: () => void }) {
  const { character, update, rollDice } = useSheet()
  const [data, setData] = useState<RulesData | null>(null)
  const [error, setError] = useState('')
  const [step, setStep] = useState(0)
  const [classId, setClassId] = useState('')
  const [choices, setChoices] = useState<LevelUpChoices>({ hp: { method: 'average', value: 0 }, picks: {}, asi: {}, notes: {} })

  useEffect(() => {
    Promise.all([window.api.getClassData(), window.api.listFeats(), window.api.listSpells(), window.api.listItems()])
      .then(([classData, feats, spells, items]) => {
        setData({
          classes: classData.classes as ClassData[],
          subclasses: classData.subclasses as SubclassData[],
          feats: feats.filter((f) => !f.supersededBy),
          spells,
          weapons: items.filter((i) => i.category === 'weapon')
        })
      })
      .catch(() => setError('Could not read the book data.'))
  }, [])

  const cls = data?.classes.find((c) => c.id === classId) ?? null
  const planResult = useMemo(() => {
    if (!data || !cls) return null
    try {
      return { plan: planLevelUp(character, cls, data), error: '' }
    } catch (e) {
      return { plan: null, error: (e as Error).message }
    }
  }, [data, cls, character])
  const plan = planResult?.plan ?? null
  const missing = plan ? missingChoices(plan, choices) : []

  function pickClass(id: string) {
    setClassId(id)
    setChoices({ hp: { method: 'average', value: 0 }, picks: {}, asi: {}, notes: {} })
  }

  function finish() {
    if (!plan || !cls || !data) return
    const { character: after } = applyLevelUp(character, plan, choices, cls)
    update((c) => { Object.assign(c, after) })
    onClose()
  }

  function renderRequirement(req: Requirement) {
    const picks = choices.picks[req.id] ?? []
    const setPicks = (v: string[]) => setChoices({ ...choices, picks: { ...choices.picks, [req.id]: v } })
    return (
      <div className="requirement" key={req.id}>
        <h4>{req.prompt}</h4>
        {req.kind === 'subclass' && (
          <PickList count={1} value={picks} onChange={setPicks}
            options={req.options.map((s) => ({ id: s.id, label: `${s.name}${s.ruleset === '2014' ? ' (legacy)' : ''}`, detail: s.features.map((f) => f.name).join(', ') }))} />
        )}
        {req.kind === 'spells' && (
          <PickList count={req.count} value={picks} onChange={setPicks}
            options={req.options.map((s) => ({ id: s.id, label: `${s.name}${s.level ? ` (level ${s.level})` : ''}`, detail: `${s.castingTime ?? ''} · ${s.range ?? ''} · ${s.duration ?? ''}` }))} />
        )}
        {req.kind === 'expertise' && (
          <PickList count={req.count} value={picks} onChange={setPicks} options={req.options.map((o) => ({ id: o.id, label: o.name }))} />
        )}
        {req.kind === 'weaponMastery' && (
          <PickList count={req.count} value={picks} onChange={setPicks} options={req.options.map((o) => ({ id: o, label: o }))} />
        )}
        {req.kind === 'asiOrFeat' && (() => {
          const a = choices.asi[req.id] ?? { mode: 'asi' as const, abilities: [] as Ability[], feat: '' }
          const set = (next: typeof a) => setChoices({ ...choices, asi: { ...choices.asi, [req.id]: next } })
          return (
            <div>
              <label><input type="radio" checked={a.mode === 'asi'} onChange={() => set({ ...a, mode: 'asi' })} /> Raise ability scores</label>{' '}
              <label><input type="radio" checked={a.mode === 'feat'} onChange={() => set({ ...a, mode: 'feat' })} /> Take a feat</label>
              {a.mode === 'asi' ? (
                <div className="asi-grid">
                  <p className="muted">Pick one ability for +2, or two abilities for +1 each. Scores cannot go above 20.</p>
                  {ABILITIES.map((ab) => {
                    const on = a.abilities.includes(ab.id as Ability)
                    return (
                      <label key={ab.id} className={`pick-option ${on ? 'on' : ''}`}>
                        <input type="checkbox" checked={on} disabled={!on && a.abilities.length >= 2}
                          onChange={() => set({ ...a, abilities: on ? a.abilities.filter((x) => x !== ab.id) : [...a.abilities, ab.id as Ability] })} />
                        {ab.name} ({character.abilityScores[ab.id as Ability]})
                      </label>
                    )
                  })}
                </div>
              ) : (
                <PickList count={1} value={a.feat ? [a.feat] : []} onChange={(v) => set({ ...a, feat: v[0] ?? '' })}
                  options={req.feats.filter((f) => req.id.endsWith('epicBoon') ? f.category === 'Epic Boon' : f.category !== 'Epic Boon').map((f) => ({ id: f.id, label: `${f.name}${f.ruleset === '2014' ? ' (legacy)' : ''}`, detail: f.prerequisite ?? f.category }))} />
              )}
            </div>
          )
        })()}
        {req.kind === 'note' && (
          <textarea className="text-input" rows={2} value={choices.notes[req.id] ?? ''}
            onChange={(e) => setChoices({ ...choices, notes: { ...choices.notes, [req.id]: e.target.value } })} />
        )}
      </div>
    )
  }

  const classOptions = data?.classes ?? []
  const current = character.manualValues.classes.filter((c) => c.level > 0).map((c) => c.name.toLowerCase())

  return (
    <div className="modal-backdrop">
      <div className="modal levelup">
        <header>
          <h2>Level up</h2>
          <ol className="steps">
            {STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>{s}</li>)}
          </ol>
          <button className="small" onClick={onClose}>Cancel</button>
        </header>

        {error && <p className="error">{error}</p>}
        {data && data.classes.length === 0 && <p className="error">No class data found. Run the book import first.</p>}
        {!data && !error && <p className="muted">Loading the book data…</p>}

        {data && step === 0 && (
          <section>
            <p>Choose the class you are gaining a level in. A class you do not have yet starts at level 1 (multiclassing).</p>
            <div className="class-grid">
              {classOptions.map((c) => {
                const have = current.includes(c.name.toLowerCase())
                const level = character.manualValues.classes.find((x) => x.name.toLowerCase() === c.name.toLowerCase())?.level ?? 0
                return (
                  <button key={c.id} className={`class-card ${classId === c.id ? 'on' : ''}`} onClick={() => pickClass(c.id)}>
                    <strong>{c.name}</strong>
                    <span>{have ? `level ${level} to ${level + 1}` : 'new class (level 1)'}</span>
                  </button>
                )
              })}
            </div>
            {planResult?.error && <p className="error">{planResult.error}</p>}
          </section>
        )}

        {data && plan && step === 1 && (
          <section>
            <h3>Hit points for {plan.className} level {plan.newClassLevel}</h3>
            <p>Hit die d{plan.hitDie}, Constitution modifier {mod(character, 'con') >= 0 ? '+' : ''}{mod(character, 'con')}. At least 1 hit point is always gained.</p>
            <label><input type="radio" checked={choices.hp.method === 'average'} onChange={() => setChoices({ ...choices, hp: { method: 'average', value: 0 } })} /> Take the average ({plan.averageHp})</label><br />
            <label>
              <input type="radio" checked={choices.hp.method === 'rolled'} onChange={() => {
                const roll = rollDice(`Level-up HP (d${plan.hitDie})`, `1d${plan.hitDie}`)
                setChoices({ ...choices, hp: { method: 'rolled', value: roll ?? 1 } })
              }} /> Roll d{plan.hitDie}
            </label>
            {choices.hp.method === 'rolled' && <span> rolled <strong>{choices.hp.value}</strong>{' '}
              <button className="small" onClick={() => setChoices({ ...choices, hp: { method: 'rolled', value: rollDice(`Level-up HP (d${plan.hitDie})`, `1d${plan.hitDie}`) ?? 1 } })}>Roll again</button></span>}
            <p className="muted">Gain: {Math.max(1, (choices.hp.method === 'average' ? plan.averageHp : choices.hp.value) + mod(character, 'con'))} hit points.</p>
          </section>
        )}

        {data && plan && step === 2 && (
          <section>
            <h3>{plan.className} level {plan.newClassLevel} (character level {plan.newTotalLevel})</h3>
            <p>Proficiency bonus: <strong>+{plan.proficiencyBonus}</strong>{plan.slots && <> · Spell slots: <strong>{plan.slots.map((n, i) => (n ? `L${i + 1}:${n}` : '')).filter(Boolean).join(' ')}</strong></>}</p>
            {plan.tableChanges.length > 0 && (
              <ul>{plan.tableChanges.map((t) => <li key={t.column}>{t.column}: {String(t.from ?? '–')} to {String(t.to)}</li>)}</ul>
            )}
            {plan.features.length === 0 && <p className="muted">No new class features at this level besides the table changes.</p>}
            {plan.features.map((f) => (
              <details key={f.id} open><summary>{f.name}</summary><p>{f.text || 'No description in the imported data.'}</p></details>
            ))}
            {plan.warnings.map((w) => <p key={w} className="warning">{w}</p>)}
          </section>
        )}

        {data && plan && step === 3 && (
          <section>
            {plan.requirements.length === 0 && <p>Nothing to choose at this level.</p>}
            {plan.requirements.map(renderRequirement)}
          </section>
        )}

        {data && plan && step === 4 && (
          <section>
            <h3>Review</h3>
            {missing.length > 0 ? (
              <>
                <p className="warning">Still to do:</p>
                <ul>{missing.map((m) => <li key={m}>{m}</li>)}</ul>
              </>
            ) : <p>Everything is chosen. Finishing applies the new level to your character.</p>}
          </section>
        )}

        <footer>
          <button disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < STEPS.length - 1 ? (
            <button className="primary" disabled={(step === 0 && !plan) || (step > 0 && !plan)} onClick={() => setStep(step + 1)}>Next</button>
          ) : (
            <button className="primary" disabled={missing.length > 0} onClick={finish}>Finish level up</button>
          )}
        </footer>
      </div>
    </div>
  )
}
