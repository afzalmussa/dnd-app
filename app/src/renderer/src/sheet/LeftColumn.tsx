// Left column: proficiency bonus, ability scores and saves, skills, and other proficiencies.

import { ABILITIES, SKILLS } from '../../../shared/coreRules'
import {
  formatBonus,
  isSaveProficient,
  mod,
  saveBonus,
  skillBonus,
  skillProficiency
} from '../../../shared/rules/abilities'
import type { ProficiencyLevel, Proficiencies } from '../../../shared/schema/character'
import { NumberInput, Section, TagList } from '../common/Inputs'
import { useSheet } from '../SheetContext'

const NEXT_LEVEL: Record<ProficiencyLevel, ProficiencyLevel> = {
  none: 'proficient',
  proficient: 'expertise',
  expertise: 'none'
}

const LEVEL_TITLE: Record<ProficiencyLevel, string> = {
  none: 'Not proficient',
  proficient: 'Proficient',
  expertise: 'Expertise'
}

export function LeftColumn() {
  const { character, update, editing, rollD20 } = useSheet()
  const pb = character.manualValues.proficiencyBonus

  return (
    <div className="column left">
      <Section title="Proficiency Bonus">
        {editing ? (
          <NumberInput value={pb} min={0} onChange={(v) => update((c) => { c.manualValues.proficiencyBonus = v })} />
        ) : pb === null ? (
          <span className="warning">Not set. Use Edit sheet to enter it.</span>
        ) : (
          <span className="stat-value">{formatBonus(pb)}</span>
        )}
      </Section>

      <Section title="Abilities and Saves">
        <div className="abilities">
          {ABILITIES.map((ability) => (
            <div className="ability" key={ability.id}>
              <div className="ability-name">{ability.name}</div>
              <button
                className="ability-mod clickable"
                title={`${ability.name} check (Shift: advantage, Ctrl: disadvantage)`}
                onClick={(e) => rollD20(`${ability.name} check`, mod(character, ability.id), e)}
              >
                {formatBonus(mod(character, ability.id))}
              </button>
              {editing ? (
                <NumberInput
                  className="ability-score"
                  value={character.abilityScores[ability.id]}
                  min={1}
                  max={30}
                  onChange={(v) => update((c) => { c.abilityScores[ability.id] = v ?? 10 })}
                />
              ) : (
                <div className="ability-score">{character.abilityScores[ability.id]}</div>
              )}
              <div className="save-row">
                <button
                  className={`prof-dot ${isSaveProficient(character, ability.id) ? 'proficient' : 'none'}`}
                  title={isSaveProficient(character, ability.id) ? 'Proficient save (click to remove)' : 'Not proficient (click to add)'}
                  onClick={() =>
                    update((c) => {
                      const saves = c.proficiencies.savingThrows
                      c.proficiencies.savingThrows = saves.includes(ability.id)
                        ? saves.filter((s) => s !== ability.id)
                        : [...saves, ability.id]
                    })
                  }
                />
                <button className="clickable save-bonus" onClick={(e) => rollD20(`${ability.name} save`, saveBonus(character, ability.id), e)}>
                  Save {formatBonus(saveBonus(character, ability.id))}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Skills">
        <div className="skills">
          {SKILLS.map((skill) => {
            const level = skillProficiency(character, skill.id)
            return (
              <div className="skill-row" key={skill.id}>
                <button
                  className={`prof-dot ${level}`}
                  title={`${LEVEL_TITLE[level]} (click to change)`}
                  onClick={() => update((c) => { c.proficiencies.skills[skill.id] = NEXT_LEVEL[level] })}
                />
                <button className="clickable skill-name" onClick={(e) => rollD20(skill.name, skillBonus(character, skill.id), e)}>
                  <span>{skill.name}</span>
                  <span className="muted small">{skill.ability.toUpperCase()}</span>
                  <span className="skill-bonus">{formatBonus(skillBonus(character, skill.id))}</span>
                </button>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Proficiencies and Languages">
        <ProficiencyList label="Armor" field="armor" />
        <ProficiencyList label="Weapons" field="weapons" />
        <ProficiencyList label="Tools" field="tools" />
        <ProficiencyList label="Languages" field="languages" />
      </Section>
    </div>
  )
}

function ProficiencyList(props: { label: string; field: keyof Omit<Proficiencies, 'savingThrows' | 'skills'> }) {
  const { character, update, editing } = useSheet()
  return (
    <div className="proficiency-list">
      <div className="small-label">{props.label}</div>
      <TagList
        items={character.proficiencies[props.field]}
        editable={editing}
        onChange={(items) => update((c) => { c.proficiencies[props.field] = items })}
      />
    </div>
  )
}
