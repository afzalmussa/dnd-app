// Turns a spell from the imported data pack into the details stored on a character's spell entry.

import type { SpellInfo } from '../api'
import type { SpellDetails } from '../schema/character'

export function componentsText(info: Pick<SpellInfo, 'components'>): string {
  const c = info.components
  if (!c) return ''
  const letters = [c.v && 'V', c.s && 'S', c.m && 'M'].filter(Boolean).join(', ')
  return c.m && c.material ? `${letters} (${c.material})` : letters
}

export function detailsFromSpell(info: SpellInfo): SpellDetails {
  return {
    school: info.school ?? '',
    castingTime: info.castingTime ?? '',
    range: info.range ?? '',
    components: componentsText(info),
    duration: info.duration ?? '',
    concentration: info.concentration,
    ritual: info.ritual,
    description: info.text,
    higherLevels: info.higherLevels,
    classes: info.classLists,
    source: `${info.book}${info.ruleset === '2014' ? ' (legacy)' : ''}`
  }
}

// Matching ignores case and punctuation, so "mage hand" finds "Mage Hand".
export function spellKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}
