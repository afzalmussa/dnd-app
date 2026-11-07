// Combat tab: attacks with clickable to-hit and damage rolls, then features
// grouped by how they are used (action, bonus action, reaction, free).

import { newId } from '../../../shared/character'
import { ABILITIES, DAMAGE_TYPES } from '../../../shared/coreRules'
import { formatBonus } from '../../../shared/rules/abilities'
import { attackBonus, damageExpression } from '../../../shared/rules/attacks'
import type { Ability, Attack } from '../../../shared/schema/character'
import type { Activation } from '../../../shared/schema/effects'
import { ChoiceInput, NumberInput, Section, TextInput, UsesTracker } from '../common/Inputs'
import { useSheet } from '../SheetContext'

const ACTION_GROUPS: { activation: Activation; title: string }[] = [
  { activation: 'action', title: 'Actions' },
  { activation: 'bonus', title: 'Bonus Actions' },
  { activation: 'reaction', title: 'Reactions' },
  { activation: 'free', title: 'Free Actions' }
]

function blankAttack(): Attack {
  return {
    id: newId(),
    name: 'New attack',
    ability: 'str',
    proficient: true,
    attackBonusExtra: 0,
    damage: '1d6',
    damageType: '',
    addAbilityToDamage: true,
    damageBonusExtra: 0,
    mastery: '',
    range: '',
    notes: ''
  }
}

export function CombatTab() {
  const { character, update, editing } = useSheet()
  return (
    <div className="tab-body">
      <Section
        title="Attacks"
        actions={editing && <button className="small" onClick={() => update((c) => { c.attacks.push(blankAttack()) })}>Add attack</button>}
      >
        {character.attacks.length === 0 && <p className="muted">No attacks yet. Use Edit sheet, then Add attack.</p>}
        {character.attacks.length > 0 && (editing ? <AttackEditor /> : <AttackTable />)}
      </Section>

      {ACTION_GROUPS.map((group) => {
        const effects = character.customEffects.filter((e) => e.activation === group.activation)
        if (effects.length === 0) return null
        return (
          <Section title={group.title} key={group.activation}>
            {effects.map((effect) => (
              <div className="action-entry" key={effect.id}>
                <div className="action-head">
                  <strong>{effect.name}</strong>
                  {effect.uses && (
                    <UsesTracker
                      max={effect.uses.max}
                      used={effect.uses.used}
                      onChange={(used) => update((c) => { c.customEffects.find((e) => e.id === effect.id)!.uses!.used = used })}
                    />
                  )}
                </div>
                {effect.description && <p className="description">{effect.description}</p>}
              </div>
            ))}
          </Section>
        )
      })}
    </div>
  )
}

function AttackTable() {
  const { character, rollD20, rollDice } = useSheet()
  return (
    <table className="attacks">
      <thead>
        <tr>
          <th>Name</th>
          <th>Hit</th>
          <th>Damage</th>
          <th>Mastery</th>
          <th>Range</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {character.attacks.map((attack) => {
          const bonus = attackBonus(character, attack)
          const damage = damageExpression(character, attack)
          return (
            <tr key={attack.id}>
              <td>{attack.name}</td>
              <td>
                <button className="clickable roll-chip" onClick={(e) => rollD20(`${attack.name} attack`, bonus, e)}>
                  {formatBonus(bonus)}
                </button>
              </td>
              <td>
                <button className="clickable roll-chip" onClick={() => rollDice(`${attack.name} damage`, damage)}>
                  {damage} {attack.damageType}
                </button>
                <button className="small crit" title="Critical hit: roll the damage dice twice" onClick={() => rollDice(`${attack.name} damage`, damage, true)}>
                  Crit
                </button>
              </td>
              <td>{attack.mastery}</td>
              <td>{attack.range}</td>
              <td className="muted">{attack.notes}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function AttackEditor() {
  const { character, update } = useSheet()

  // Small helper so each field below reads as one line.
  function set(index: number, change: (attack: Attack) => void) {
    update((c) => change(c.attacks[index]))
  }

  return (
    <div className="attack-editor">
      {character.attacks.map((attack, i) => (
        <div className="edit-card" key={attack.id}>
          <div className="edit-grid">
            <label>Name <TextInput value={attack.name} onChange={(v) => set(i, (a) => { a.name = v })} /></label>
            <label>
              Ability
              <select value={attack.ability} onChange={(e) => set(i, (a) => { a.ability = e.target.value as Ability })}>
                {ABILITIES.map((ab) => <option key={ab.id} value={ab.id}>{ab.name}</option>)}
              </select>
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={attack.proficient} onChange={(e) => set(i, (a) => { a.proficient = e.target.checked })} />
              Proficient
            </label>
            <label>Extra to hit <NumberInput value={attack.attackBonusExtra} onChange={(v) => set(i, (a) => { a.attackBonusExtra = v ?? 0 })} /></label>
            <label>Damage dice <TextInput value={attack.damage} placeholder="1d8" onChange={(v) => set(i, (a) => { a.damage = v })} /></label>
            <label>Damage type <ChoiceInput value={attack.damageType} options={DAMAGE_TYPES} onChange={(v) => set(i, (a) => { a.damageType = v })} /></label>
            <label className="checkbox">
              <input type="checkbox" checked={attack.addAbilityToDamage} onChange={(e) => set(i, (a) => { a.addAbilityToDamage = e.target.checked })} />
              Add ability to damage
            </label>
            <label>Extra damage <NumberInput value={attack.damageBonusExtra} onChange={(v) => set(i, (a) => { a.damageBonusExtra = v ?? 0 })} /></label>
            <label>Mastery <TextInput value={attack.mastery} onChange={(v) => set(i, (a) => { a.mastery = v })} /></label>
            <label>Range <TextInput value={attack.range} onChange={(v) => set(i, (a) => { a.range = v })} /></label>
            <label className="wide">Notes <TextInput value={attack.notes} onChange={(v) => set(i, (a) => { a.notes = v })} /></label>
          </div>
          <button className="small danger" onClick={() => update((c) => { c.attacks.splice(i, 1) })}>Remove attack</button>
        </div>
      ))}
    </div>
  )
}
