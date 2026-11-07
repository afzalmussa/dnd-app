// Top of the sheet: portrait, name, class, HP, hit dice, rests, inspiration, initiative.

import { useState } from 'react'
import { formatBonus, initiativeBonus } from '../../../shared/rules/abilities'
import { applyDamage, applyHealing, gainTempHp } from '../../../shared/rules/hitPoints'
import { longRest, shortRest, spendHitDie } from '../../../shared/rules/rest'
import { classLabel, hitDicePools, maxHp, totalLevel } from '../../../shared/rules/summary'
import { NumberInput, TextInput, UsesTracker } from '../common/Inputs'
import { useSheet } from '../SheetContext'
import { resizeImage } from './portrait'

export function TopBar() {
  const { character, update, editing, rollD20, rollDice } = useSheet()
  const [amount, setAmount] = useState<number | null>(null)
  const max = maxHp(character)
  const state = character.state

  function changeHp(kind: 'damage' | 'heal' | 'temp') {
    if (!amount || amount <= 0) return
    update((c) => {
      if (kind === 'damage') applyDamage(c, amount)
      if (kind === 'heal') applyHealing(c, amount, max)
      if (kind === 'temp') gainTempHp(c, amount)
    })
    setAmount(null)
  }

  function spendDie(die: number) {
    const roll = rollDice(`Hit die (d${die})`, `1d${die}`)
    if (roll === null) return
    update((c) => {
      spendHitDie(c, die, roll, max)
    })
  }

  async function choosePortrait(file: File | undefined) {
    if (!file) return
    const dataUrl = await resizeImage(file, 256)
    update((c) => {
      c.portrait = dataUrl
    })
  }

  return (
    <div className="top-bar">
      <div className="portrait">
        {character.portrait ? <img src={character.portrait} alt="" /> : <div className="portrait-empty">No portrait</div>}
        {editing && (
          <div className="portrait-actions">
            <label className="button small">
              Choose…
              <input type="file" accept="image/*" hidden onChange={(e) => choosePortrait(e.target.files?.[0])} />
            </label>
            {character.portrait && (
              <button className="small" onClick={() => update((c) => { c.portrait = null })}>
                Remove
              </button>
            )}
          </div>
        )}
      </div>

      <div className="identity">
        {editing ? (
          <>
            <TextInput className="name-input" value={character.name} onChange={(v) => update((c) => { c.name = v })} />
            <div className="identity-row">
              <label>Species <TextInput value={character.speciesName} onChange={(v) => update((c) => { c.speciesName = v })} /></label>
              <label>Background <TextInput value={character.backgroundName} onChange={(v) => update((c) => { c.backgroundName = v })} /></label>
              <label>Player <TextInput value={character.player} onChange={(v) => update((c) => { c.player = v })} /></label>
            </div>
            <ClassEditor />
          </>
        ) : (
          <>
            <h1>{character.name}</h1>
            <div className="subtitle">{classLabel(character)}</div>
            <div className="muted">
              {[character.speciesName, character.backgroundName].filter(Boolean).join(' · ')}
              {character.player && ` · played by ${character.player}`}
            </div>
          </>
        )}
      </div>

      <div className="hp-box">
        <div className="box-label">Hit Points</div>
        <div className="hp-numbers">
          <div>
            <span className="small-label">Current</span>
            {editing ? (
              <NumberInput value={state.hpCurrent} min={0} onChange={(v) => update((c) => { c.state.hpCurrent = v ?? 0 })} />
            ) : (
              <span className={`hp-current ${state.hpCurrent === 0 ? 'down' : ''}`}>{state.hpCurrent}</span>
            )}
          </div>
          <div>
            <span className="small-label">Max</span>
            {editing ? (
              <NumberInput value={character.manualValues.maxHp} min={1} onChange={(v) => update((c) => { c.manualValues.maxHp = v })} />
            ) : (
              <span className="hp-max">{max || '?'}</span>
            )}
          </div>
          <div>
            <span className="small-label">Temp</span>
            <span className="hp-temp">{state.tempHp}</span>
          </div>
        </div>
        <div className="hp-controls">
          <NumberInput value={amount} min={0} placeholder="Amount" onChange={setAmount} />
          <button className="danger" onClick={() => changeHp('damage')}>Damage</button>
          <button className="good" onClick={() => changeHp('heal')}>Heal</button>
          <button onClick={() => changeHp('temp')}>Temp</button>
        </div>
        {state.hpCurrent === 0 && max > 0 && <DeathSaves />}
      </div>

      <div className="hit-dice">
        <div className="box-label">Hit Dice</div>
        {hitDicePools(character).map((pool) => (
          <div className="hit-die-row" key={pool.die}>
            <span>
              d{pool.die}: {pool.total - pool.used} / {pool.total}
            </span>
            <button className="small" disabled={pool.used >= pool.total} onClick={() => spendDie(pool.die)}>
              Spend
            </button>
          </div>
        ))}
        <div className="rest-buttons">
          <button onClick={() => update(shortRest)} title="Resets features that recharge on a short rest">
            Short Rest
          </button>
          <button
            onClick={() => {
              if (confirm('Take a long rest? HP, hit dice, spell slots and features reset.')) {
                update((c) => longRest(c, max))
              }
            }}
          >
            Long Rest
          </button>
        </div>
      </div>

      <div className="top-stats">
        <button
          className="stat clickable"
          title="Roll initiative (Shift: advantage, Ctrl: disadvantage)"
          onClick={(e) => rollD20('Initiative', initiativeBonus(character), e)}
        >
          <span className="small-label">Initiative</span>
          <span className="stat-value">{formatBonus(initiativeBonus(character))}</span>
        </button>
        {editing && (
          <label className="small-label">
            Extra initiative
            <NumberInput
              value={character.manualValues.initiativeBonus}
              onChange={(v) => update((c) => { c.manualValues.initiativeBonus = v ?? 0 })}
            />
          </label>
        )}
        <button
          className={`stat inspiration ${state.inspiration ? 'on' : ''}`}
          title="Heroic Inspiration"
          onClick={() => update((c) => { c.state.inspiration = !c.state.inspiration })}
        >
          <span className="small-label">Inspiration</span>
          <span className="stat-value">{state.inspiration ? '★' : '☆'}</span>
        </button>
        <div className="stat">
          <span className="small-label">Level</span>
          <span className="stat-value">{totalLevel(character)}</span>
        </div>
      </div>
    </div>
  )
}

// Hand-entered class list. Several rows means multiclass.
function ClassEditor() {
  const { character, update } = useSheet()
  return (
    <div className="class-editor">
      {character.manualValues.classes.map((cls, i) => (
        <div className="class-row" key={i}>
          <label>Class <TextInput value={cls.name} onChange={(v) => update((c) => { c.manualValues.classes[i].name = v })} /></label>
          <label>Subclass <TextInput value={cls.subclass} onChange={(v) => update((c) => { c.manualValues.classes[i].subclass = v })} /></label>
          <label>
            Lvl
            <NumberInput value={cls.level} min={1} max={20} onChange={(v) => update((c) => { c.manualValues.classes[i].level = v ?? 1 })} />
          </label>
          <label>
            Hit die d
            <select value={cls.hitDie} onChange={(e) => update((c) => { c.manualValues.classes[i].hitDie = Number(e.target.value) })}>
              {[6, 8, 10, 12].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          {character.manualValues.classes.length > 1 && (
            <button className="small" onClick={() => update((c) => { c.manualValues.classes.splice(i, 1) })}>
              Remove
            </button>
          )}
        </div>
      ))}
      <button
        className="small"
        onClick={() => update((c) => { c.manualValues.classes.push({ name: '', subclass: '', level: 1, hitDie: 8 }) })}
      >
        Add class (multiclass)
      </button>
    </div>
  )
}

function DeathSaves() {
  const { character, update, rollD20 } = useSheet()
  const saves = character.state.deathSaves
  return (
    <div className="death-saves">
      <span>Death saves</span>
      <span className="small-label">Successes</span>
      <UsesTracker max={3} used={saves.successes} onChange={(n) => update((c) => { c.state.deathSaves.successes = n })} />
      <span className="small-label">Failures</span>
      <UsesTracker max={3} used={saves.failures} onChange={(n) => update((c) => { c.state.deathSaves.failures = n })} />
      <button className="small" onClick={(e) => rollD20('Death save', 0, e)}>Roll</button>
    </div>
  )
}
