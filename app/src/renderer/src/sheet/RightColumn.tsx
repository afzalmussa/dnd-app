// Right column: AC, speed, resources, defenses, conditions, senses.

import { clampExhaustion, effectiveSpeed, exhaustionSpeedPenalty } from '../../../shared/rules/exhaustion'
import { CONDITIONS, DAMAGE_TYPES } from '../../../shared/coreRules'
import { passivePerception } from '../../../shared/rules/abilities'
import { armorClass, walkSpeed } from '../../../shared/rules/summary'
import { effectiveDefenses, effectiveSenses, resourceMax } from '../../../shared/rules/effects'
import type { CharacterFile } from '../../../shared/schema/character'
import { NumberInput, Section, TagList, UsesTracker } from '../common/Inputs'
import { useSheet } from '../SheetContext'

const RESET_TEXT = { short: 'Short or long rest', long: 'Long rest', none: 'Does not reset' }

export function RightColumn() {
  const { character, update, editing } = useSheet()
  const resources = character.customEffects.filter((e) => e.uses !== null && e.active)

  return (
    <div className="column right">
      <div className="ac-speed">
        <div className="stat big">
          <span className="small-label">Armor Class</span>
          {editing ? (
            <NumberInput
              value={character.manualValues.armorClass}
              placeholder="10 + Dex"
              onChange={(v) => update((c) => { c.manualValues.armorClass = v })}
            />
          ) : (
            <span className="stat-value">{armorClass(character)}</span>
          )}
        </div>
        <div className="stat big">
          <span className="small-label">Speed</span>
          {editing ? (
            <NumberInput value={character.manualValues.speed} onChange={(v) => update((c) => { c.manualValues.speed = v })} />
          ) : (
            <span className="stat-value" title={character.state.exhaustion ? `Reduced by Exhaustion (-${exhaustionSpeedPenalty(character.state.exhaustion)} ft)` : undefined}>{effectiveSpeed(walkSpeed(character), character.state.exhaustion) ?? '?'} ft</span>
          )}
        </div>
      </div>

      <Section title="Resources">
        {resources.length === 0 && <p className="muted">Features with limited uses appear here. Add them on the Features tab.</p>}
        {resources.map((effect) => (
          <div className="resource" key={effect.id}>
            <div className="resource-name">{effect.name}</div>
            <UsesTracker
              max={resourceMax(character, effect)}
              used={Math.min(effect.uses!.used, resourceMax(character, effect))}
              label={effect.name}
              onChange={(used) =>
                update((c) => {
                  c.customEffects.find((e) => e.id === effect.id)!.uses!.used = used
                })
              }
            />
            <div className="muted small">{RESET_TEXT[effect.uses!.resetOn]}</div>
          </div>
        ))}
      </Section>

      <Section title="Defenses">
        {(['resistances', 'immunities', 'vulnerabilities'] as const).some((k) => effectiveDefenses(character)[k].length > character.defenses[k].length) && (
          <p className="muted small">Includes defenses from active features (shown in the Features tab).</p>
        )}
        <DefenseList label="Resistances" field="resistances" options={DAMAGE_TYPES} />
        {/* Immunity can be to a damage type or to a condition. */}
        <DefenseList label="Immunities" field="immunities" options={[...DAMAGE_TYPES, ...CONDITIONS.filter((c) => c !== 'Exhaustion')]} />
        <DefenseList label="Vulnerabilities" field="vulnerabilities" options={DAMAGE_TYPES} />
      </Section>

      <Section title="Conditions">
        {/* Conditions change during play, so they are always editable. */}
        <TagList
          items={character.state.conditions}
          editable
          // Exhaustion has its own level counter below, so it is not in this list.
          options={CONDITIONS.filter((c) => c !== 'Exhaustion')}
          placeholder="Add condition…"
          onChange={(items) => update((c) => { c.state.conditions = items })}
        />
        <div className="exhaustion">
          <span className="small-label">Exhaustion level</span>
          <NumberInput
            value={character.state.exhaustion}
            min={0}
            onChange={(v) => update((c) => { c.state.exhaustion = clampExhaustion(v ?? 0) })}
          />
        </div>
      </Section>

      <Section title="Senses">
        <div className="passive">
          Passive Perception <strong>{passivePerception(character)}</strong>
        </div>
        <TagList
          items={editing ? character.senses : effectiveSenses(character)}
          editable={editing}
          placeholder="e.g. Darkvision 60 ft"
          onChange={(items) => update((c) => { c.senses = items })}
        />
      </Section>
    </div>
  )
}

function DefenseList(props: { label: string; field: keyof CharacterFile['defenses']; options: string[] }) {
  const { character, update, editing } = useSheet()
  return (
    <div className="proficiency-list">
      <div className="small-label">{props.label}</div>
      <TagList
        items={editing ? character.defenses[props.field] : effectiveDefenses(character)[props.field]}
        options={props.options}
        editable={editing}
        onChange={(items) => update((c) => { c.defenses[props.field] = items })}
      />
    </div>
  )
}
