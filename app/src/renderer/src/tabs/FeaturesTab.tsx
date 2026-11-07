// Features and Traits tab. In Milestone 1 features are entered by hand; any
// feature given a number of uses also shows as a resource in the right column.
// The full custom feature editor (modifiers, timed effects, triggers) is Milestone 4.

import { newId } from '../../../shared/character'
import type { CustomEffect } from '../../../shared/schema/character'
import type { Activation } from '../../../shared/schema/effects'
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
        <label className="wide">
          Description
          <textarea value={effect.description} rows={3} onChange={(ev) => set((e) => { e.description = ev.target.value })} />
        </label>
      </div>
      <button className="small danger" onClick={() => update((c) => { c.customEffects.splice(props.index, 1) })}>Remove feature</button>
    </div>
  )
}
