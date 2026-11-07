import { describe, expect, it } from 'vitest'
import { CharacterFileError, createBlankCharacter, fileNameFor, normalizeCharacter } from '../../src/shared/character'
import { ABILITIES, SKILLS } from '../../src/shared/coreRules'

describe('normalizeCharacter', () => {
  it('round-trips a blank character through JSON unchanged', () => {
    const blank = createBlankCharacter()
    expect(normalizeCharacter(JSON.parse(JSON.stringify(blank)))).toEqual(blank)
  })

  it('fills in fields missing from an older file', () => {
    const loaded = normalizeCharacter({ schemaVersion: 1, id: 'x', name: 'Old', state: { hpCurrent: 7 } })
    expect(loaded.state.hpCurrent).toBe(7)
    expect(loaded.state.tempHp).toBe(0)
    expect(loaded.coins.gp).toBe(0)
  })

  it.each([
    ['not an object', 'hello'],
    ['an array', []],
    ['no schemaVersion', { id: 'x', name: 'y' }],
    ['no name', { schemaVersion: 1, id: 'x' }],
    ['a newer schema', { schemaVersion: 99, id: 'x', name: 'y' }]
  ])('rejects %s', (_label, raw) => {
    expect(() => normalizeCharacter(raw)).toThrow(CharacterFileError)
  })
})

describe('fileNameFor', () => {
  it('builds a safe file name from the name and id', () => {
    const c = createBlankCharacter()
    c.id = 'abcdef123456'
    c.name = "Grok the Loud's Axe!"
    expect(fileNameFor(c)).toBe('grok-the-loud-s-axe-abcdef.json')
    c.name = '???'
    expect(fileNameFor(c)).toBe('character-abcdef.json')
  })
})

describe('coreRules.json', () => {
  it('has the six abilities and every skill points at one of them', () => {
    expect(ABILITIES.map((a) => a.id)).toEqual(['str', 'dex', 'con', 'int', 'wis', 'cha'])
    const ids = new Set(ABILITIES.map((a) => a.id))
    for (const skill of SKILLS) expect(ids.has(skill.ability)).toBe(true)
  })
})
