import { describe, expect, it } from 'vitest'
import type { SpellInfo } from '../../src/shared/api'
import { componentsText, detailsFromSpell, spellKey } from '../../src/shared/rules/spellData'

const info: SpellInfo = {
  id: 'spell.test.phb24', name: 'Test Bolt', level: 1, school: 'Evocation', castingTime: 'Action', range: '60 feet',
  components: { v: true, s: true, m: true, material: 'a pinch of dust' }, duration: 'Instantaneous',
  concentration: false, ritual: false, classLists: ['Wizard'], text: 'A bolt.', higherLevels: null, book: 'phb24', ruleset: '2024'
}

describe('spell data', () => {
  it('writes components the way the book does', () => {
    expect(componentsText(info)).toBe('V, S, M (a pinch of dust)')
    expect(componentsText({ components: { v: true, s: false, m: false, material: null } })).toBe('V')
  })
  it('copies the book details onto the character spell', () => {
    const d = detailsFromSpell(info)
    expect(d.castingTime).toBe('Action')
    expect(d.range).toBe('60 feet')
    expect(d.duration).toBe('Instantaneous')
    expect(d.description).toBe('A bolt.')
  })
  it('matches names ignoring case and punctuation', () => {
    expect(spellKey("Tasha's Hideous Laughter")).toBe(spellKey('tashas hideous laughter'))
  })
})
