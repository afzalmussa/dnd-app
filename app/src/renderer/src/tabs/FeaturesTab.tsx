// Features and Traits tab. In Milestone 1 features are entered by hand; any
// feature given a number of uses also shows as a resource in the right column.
// The full custom feature editor (modifiers, timed effects, triggers) is Milestone 4.

import { useEffect, useState } from 'react'
import { newId } from '../../../shared/character'
import type { CustomEffect } from '../../../shared/schema/character'
import type { Activation } from '../../../shared/schema/effects'
import { advanceTime, formatGameTime, gameMinutes, isActive, MODIFIER_TARGETS, nextRound, toggleNames } from '../../../shared/rules/effects'
import { SKILLS } from '../../../shared/coreRules'
import type { Modifier } from '../../../shared/schema/effects'
import { NumberInput, Section, TextInput } from '../common/Inputs'
import { useSheet } from '../SheetContext'

const ACTIVATION_TEXT: Record<Activation, string> = {
  passive: 'Passive',
  action: 'Action',
  bonus: 'Bonus action',
  reaction: 'Reaction',
  free: 'Free'
}

const KIND_TEXT: Record<CustomEffect['kind'], string> = {
  feature: 'Feature',
  trait: 'Trait',
  condition: 'Condition',
  curse: 'Curse',
  boon: 'Boon'
}

function blankFeature(): CustomEffect {
  return {
    id: newId(),
    name: 'New feature',
    kind: 'feature',
    source: '',
    description: '',
    activation: 'passive',
    active: true,
    uses: null,
    modifiers: [],
    triggers: [],
    duration: { type: 'permanent' }
  }
}

export function FeaturesTab() {
  const { character, update, editing } = useSheet()

  return (
    <div className="tab-body">
      <PlayControls />
      <Section
        title="Features and Traits"
        actions={editing && <button className="small" onClick={() => update((c) => { c.customEffects.push(blankFeature()) })}>Add feature</button>}
      >
        {character.customEffects.length === 0 && <p className="muted">No features yet. Use Edit sheet, then Add feature.</p>}
        {character.customEffects.map((effect, i) =>
          editing ? <FeatureEditor key={effect.id} index={i} /> : (
            <div className="feature" key={effect.id}>
              <div className="feature-head">
                <strong>{effect.name}</strong>
                <span className="muted small">
                  {[KIND_TEXT[effect.kind], effect.source, ACTIVATION_TEXT[effect.activation]].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="feature-meta">
                <label className="checkbox small">
                  <input type="checkbox" checked={effect.active} onChange={(ev) => update((c) => { c.customEffects[i].active = ev.target.checked })} />
                  Active
                </label>
                {!isActive(effect, character) && effect.active && <span className="warning small">ended</span>}
                {durationText(effect) && <span className="muted small">{durationText(effect)}</span>}
                {effect.modifiers.map((m, k) => <span className="chip" key={k}>{modifierText(m)}</span>)}
                {effect.triggers.length > 0 && <span className="chip">Healing deals damage instead</span>}
              </div>
              {effect.description && <p className="description">{effect.description}</p>}
            </div>
          )
        )}
      </Section>
    </div>
  )
}

function FeatureEditor(props: { index: number }) {
  const { character, update } = useSheet()
  const effect = character.customEffects[props.index]

  function set(change: (e: CustomEffect) => void) {
    update((c) => change(c.customEffects[props.index]))
  }

  return (
    <div className="edit-card">
      <div className="edit-grid">
        <label>Name <TextInput value={effect.name} onChange={(v) => set((e) => { e.name = v })} /></label>
        <label>
          Kind
          <select value={effect.kind} onChange={(ev) => set((e) => { e.kind = ev.target.value as CustomEffect['kind'] })}>
            {Object.entries(KIND_TEXT).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label>Source <TextInput value={effect.source} placeholder="e.g. Barbarian 1" onChange={(v) => set((e) => { e.source = v })} /></label>
        <label>
          Used as
          <select value={effect.activation} onChange={(ev) => set((e) => { e.activation = ev.target.value as Activation })}>
            {Object.entries(ACTIVATION_TEXT).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={effect.uses !== null}
            onChange={(ev) => set((e) => { e.uses = ev.target.checked ? { max: 1, used: 0, resetOn: 'long' } : null })}
          />
          Limited uses
        </label>
        {effect.uses && (
          <>
            <label>Max uses <NumberInput value={effect.uses.max} min={1} onChange={(v) => set((e) => { e.uses!.max = Math.max(1, v ?? 1) })} /></label>
            <label>
              Resets on
              <select value={effect.uses.resetOn} onChange={(ev) => set((e) => { e.uses!.resetOn = ev.target.value as 'short' | 'long' | 'none' })}>
                <option value="short">Short or long rest</option>
                <option value="long">Long rest</option>
                <option value="none">Does not reset</option>
              </select>
            </label>
          </>
        )}
        <label>
          Lasts
          <select
            value={effect.duration.type}
            onChange={(ev) => set((e) => {
              const t = ev.target.value
              e.duration = t === 'untilRest' ? { type: 'untilRest', rest: 'long' } : t === 'rounds' ? { type: 'rounds', remaining: 10 }
                : t === 'untilTime' ? { type: 'untilTime', at: gameMinutes(character) + 60 } : { type: 'permanent' }
            })}
          >
            <option value="permanent">Until removed</option>
            <option value="untilRest">Until a rest</option>
            <option value="rounds">A number of rounds</option>
            <option value="untilTime">Until an in-game time</option>
          </select>
        </label>
        {effect.duration.type === 'untilRest' && (
          <label>
            Which rest
            <select value={effect.duration.rest} onChange={(ev) => set((e) => { e.duration = { type: 'untilRest', rest: ev.target.value as 'short' | 'long' } })}>
              <option value="short">Short or long rest</option>
              <option value="long">Long rest</option>
            </select>
          </label>
        )}
        {effect.duration.type === 'rounds' && (
          <label>Rounds left <NumberInput value={effect.duration.remaining} min={0} onChange={(v) => set((e) => { e.duration = { type: 'rounds', remaining: Math.max(0, v ?? 0) } })} /></label>
        )}
        {effect.duration.type === 'untilTime' && (
          <label>
            Ends at (minutes on the game clock; now {formatGameTime(gameMinutes(character))})
            <NumberInput value={effect.duration.at} min={0} onChange={(v) => set((e) => { e.duration = { type: 'untilTime', at: Math.max(0, v ?? 0) } })} />
          </label>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={effect.triggers.length > 0}
            onChange={(ev) => set((e) => { e.triggers = ev.target.checked ? [{ on: 'heal', action: 'damageInstead', ignoreResistance: true }] : [] })}
          />
          Healing deals damage instead
        </label>
        <div className="wide modifiers-editor">
          <div className="small-label">Changes to stats ("modifiers")</div>
          {effect.modifiers.map((m, k) => (
            <div className="modifier-row" key={k}>
              <select value={m.target.startsWith('skill.') ? 'skill' : m.target.startsWith('resource.') ? 'resource' : m.target}
                onChange={(ev) => set((e) => {
                  const v = ev.target.value
                  e.modifiers[k].target = v === 'skill' ? `skill.${SKILLS[0].id}` : v === 'resource' ? `resource.${e.id}.max` : v
                })}>
                {MODIFIER_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                <option value="skill">A skill</option>
                <option value="resource">This feature's use counter</option>
              </select>
              {m.target.startsWith('skill.') && (
                <select value={m.target} onChange={(ev) => set((e) => { e.modifiers[k].target = ev.target.value })}>
                  {SKILLS.map((s) => <option key={s.id} value={`skill.${s.id}`}>{s.name}</option>)}
                </select>
              )}
              <select value={m.op} onChange={(ev) => set((e) => { e.modifiers[k].op = ev.target.value as Modifier['op'] })}>
                <option value="add">add</option>
                <option value="set">set to</option>
                <option value="cap">can't go above</option>
                <option value="atLeast">can't go below</option>
              </select>
              {MODIFIER_TARGETS.find((t) => t.value === m.target)?.text ? (
                <TextInput value={String(m.value)} placeholder="e.g. Cold" onChange={(v) => set((e) => { e.modifiers[k].value = v })} />
              ) : (
                <NumberInput value={typeof m.value === 'number' ? m.value : 0} onChange={(v) => set((e) => { e.modifiers[k].value = v ?? 0 })} />
              )}
              <TextInput value={m.when ?? ''} placeholder="only while… (toggle, e.g. raging)" onChange={(v) => set((e) => { e.modifiers[k].when = v.trim() || undefined })} />
              <button className="small danger" onClick={() => set((e) => { e.modifiers.splice(k, 1) })}>×</button>
            </div>
          ))}
          <button className="small" onClick={() => set((e) => { e.modifiers.push({ target: 'ac', op: 'add', value: 1 }) })}>Add change</button>
        </div>
        <label className="wide">
          Description
          <textarea value={effect.description} rows={3} onChange={(ev) => set((e) => { e.description = ev.target.value })} />
        </label>
      </div>
      <button className="small danger" onClick={() => update((c) => { c.customEffects.splice(props.index, 1) })}>Remove feature</button>
    </div>
  )
}

function modifierText(m: Modifier): string {
  const label = MODIFIER_TARGETS.find((t) => t.value === m.target)?.label ?? m.target
  const opText = { add: typeof m.value === 'number' && m.value >= 0 ? '+' : '', set: '=', cap: 'max ', atLeast: 'min ' }[m.op]
  return `${label} ${opText}${m.value}${m.when ? ` (while ${m.when})` : ''}`
}

function durationText(effect: CustomEffect): string {
  const d = effect.duration
  if (d.type === 'rounds') return `${d.remaining} round${d.remaining === 1 ? '' : 's'} left`
  if (d.type === 'untilRest') return `until a ${d.rest} rest`
  if (d.type === 'untilTime') return `ends ${formatGameTime(d.at)}`
  return ''
}

// Switches for conditions named in modifiers (e.g. "raging"), the in-game clock and the round counter.
function PlayControls() {
  const { character, update } = useSheet()
  const toggles = toggleNames(character)
  const [minutes, setMinutes] = useState<number | null>(60)
  const [ended, setEnded] = useState<string[]>([])
  const [dmClock, setDmClock] = useState(false) // a campaign clock exists, so the DM view sets the time
  useEffect(() => {
    void window.api.getCampaign().then((c) => setDmClock(!!c))
  }, [])
  return (
    <Section title="In play">
      <div className="play-controls">
        {toggles.map((name) => (
          <label key={name} className="checkbox">
            <input type="checkbox" checked={!!character.state.toggles[name]} onChange={(ev) => update((c) => { c.state.toggles[name] = ev.target.checked })} />
            {name}
          </label>
        ))}
        <span className="small-label">Game time</span>
        <strong>{formatGameTime(gameMinutes(character))}</strong>
        <NumberInput value={minutes} min={0} onChange={setMinutes} />
        <span className="muted small">min</span>
        {dmClock ? <span className="muted small">set in the DM view (campaign clock)</span> : (
          <button className="small" onClick={() => update((c) => { setEnded(advanceTime(c, minutes ?? 0)) })}>Advance</button>
        )}
        <button className="small" onClick={() => update((c) => { setEnded(nextRound(c)) })}>Next round</button>
      </div>
      {ended.length > 0 && <p className="warning small">Ended: {ended.join(', ')}</p>}
    </Section>
  )
}
