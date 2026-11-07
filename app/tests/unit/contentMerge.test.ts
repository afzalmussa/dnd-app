import { describe, expect, it } from 'vitest'
import { mergeEntries } from '../../src/shared/rules/contentMerge'

describe('merging your content over the book', () => {
  const book = [{ id: 'spell.a', name: 'Book A' }, { id: 'spell.b', name: 'Book B' }]
  it('replaces a book entry with the same id and marks it edited', () => {
    const out = mergeEntries(book, [{ id: 'spell.a', name: 'My A' }])
    expect(out.find((e) => e.id === 'spell.a')).toMatchObject({ name: 'My A', _origin: 'edited' })
    expect(out.find((e) => e.id === 'spell.b')).toMatchObject({ name: 'Book B', _origin: 'book' })
  })
  it('adds a new id as homebrew and never changes the book list', () => {
    const out = mergeEntries(book, [{ id: 'spell.mine.user', name: 'Mine' }])
    expect(out).toHaveLength(3)
    expect(out[2]).toMatchObject({ id: 'spell.mine.user', _origin: 'user' })
    expect(book[0].name).toBe('Book A')
  })
})
