import { describe, expect, it } from 'vitest'
import {
  buildPublished, extractShareBlocks, hasShareBlocks, indexMarkdown, publishedPath, whatsappText, wrapAsSecret, wrapAsShare
} from '../../src/shared/wiki/publish'

const page = `# Session 12

Private DM plan: Strahd attacks at dusk.

> [!share] The Mists of Barovia
> The fog is thick and **cold**.
> Wolves howl far away.

More private notes.

> [!secret Auriviel] A whisper
> Your tattoos itch.
>
> A voice says your name.

> [!note] Ordinary callout
> Not shared.
`

describe('share blocks', () => {
  it('finds shared and secret blocks and ignores private text and other callouts', () => {
    const blocks = extractShareBlocks(page)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ kind: 'share', player: null, title: 'The Mists of Barovia', body: 'The fog is thick and **cold**.\nWolves howl far away.' })
    expect(blocks[1]).toMatchObject({ kind: 'secret', player: 'Auriviel', title: 'A whisper' })
    expect(blocks[1].body).toBe('Your tattoos itch.\n\nA voice says your name.')
    expect(hasShareBlocks('No callouts here')).toBe(false)
  })

  it('never includes private text in what is published', () => {
    const out = buildPublished('Session 12', extractShareBlocks(page).filter((b) => b.kind === 'share'), '2026-11-08')
    expect(out).toContain('The fog is thick')
    expect(out).not.toContain('Strahd attacks')
    expect(out).not.toContain('tattoos')
    expect(out.startsWith('---\npublished: 2026-11-08\nfrom: Session 12\n---\n# Session 12')).toBe(true)
  })

  it('wraps a selection as shared or secret and reads it back', () => {
    const shared = wrapAsShare('Line one\n\nLine two', 'Inn')
    expect(extractShareBlocks(shared)[0]).toMatchObject({ kind: 'share', title: 'Inn', body: 'Line one\n\nLine two' })
    const secret = wrapAsSecret('Psst', 'Thrandur', '')
    expect(extractShareBlocks(secret)[0]).toMatchObject({ kind: 'secret', player: 'Thrandur', body: 'Psst' })
  })

  it('writes WhatsApp text with single-star bold', () => {
    const text = whatsappText('Session 12', extractShareBlocks(page).filter((b) => b.kind === 'share'))
    expect(text).toBe('*Session 12*\n\n*The Mists of Barovia*\nThe fog is thick and *cold*.\nWolves howl far away.')
  })

  it('puts published pages under DM Shares and lists them newest first', () => {
    expect(publishedPath('Sessions/12.md')).toBe('DM Shares/Sessions/12.md')
    const md = indexMarkdown([{ path: 'DM Shares/a.md', title: 'A', date: '2026-01-01' }, { path: 'DM Shares/b.md', title: 'B', date: '2026-02-01' }])
    expect(md.indexOf('[[DM Shares/b|B]]')).toBeLessThan(md.indexOf('[[DM Shares/a|A]]'))
  })
})
