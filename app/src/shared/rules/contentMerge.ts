// Merges your own content over the imported book entries (pure, so it is easy to test).
// "edited": your entry has the same id as a book entry and replaces it.
// "user": a new id, so it is homebrew. Everything else is "book".

export type Origin = 'book' | 'edited' | 'user'

export function mergeEntries<T extends { id: string }>(book: T[], mine: T[]): (T & { _origin: Origin })[] {
  const mineById = new Map(mine.map((e) => [e.id, e]))
  const bookIds = new Set(book.map((e) => e.id))
  const out: (T & { _origin: Origin })[] = book.map((e) =>
    mineById.has(e.id) ? { ...mineById.get(e.id)!, _origin: 'edited' as const } : { ...e, _origin: 'book' as const }
  )
  for (const e of mine) if (!bookIds.has(e.id)) out.push({ ...e, _origin: 'user' as const })
  return out
}
