import { describe, expect, it } from 'vitest'
import {
  backlinks, extractLinks, extractTags, folderNote, isSafeRelativePath, joinFrontMatter, readProperties,
  resolveLink, rewriteLinksOnRename, splitFrontMatter
} from '../../src/shared/wiki/wiki'

describe('front matter', () => {
  const page = '---\ntags: [npc]\naliases: Strahd\n---\n# Strahd\nText [[Barovia]]\n'
  it('splits and joins back to exactly the same text', () => {
    const { front, body } = splitFrontMatter(page)
    expect(front).toBe('---\ntags: [npc]\naliases: Strahd\n---\n')
    expect(body).toBe('# Strahd\nText [[Barovia]]\n')
    expect(joinFrontMatter(front, body)).toBe(page)
  })
  it('keeps Windows line endings untouched', () => {
    const crlf = '---\r\na: 1\r\n---\r\nBody\r\n'
    const { front, body } = splitFrontMatter(crlf)
    expect(joinFrontMatter(front, body)).toBe(crlf)
  })
  it('has no front matter when the page does not start with ---', () => {
    expect(splitFrontMatter('# Title\n---\nnot front matter').front).toBe('')
  })
  it('lists properties', () => {
    expect(readProperties(splitFrontMatter(page).front)).toEqual([{ key: 'tags', value: '[npc]' }, { key: 'aliases', value: 'Strahd' }])
  })
})

describe('links', () => {
  it('reads plain, labelled, heading and image links', () => {
    const links = extractLinks('[[A]] [[B|shown]] [[C#Part]] ![[map.png]] [[D/E]]')
    expect(links.map((l) => [l.target, l.heading, l.label, l.image])).toEqual([
      ['A', null, null, false], ['B', null, 'shown', false], ['C', 'Part', null, false], ['map.png', null, null, true], ['D/E', null, null, false]
    ])
  })
  it('finds tags', () => {
    expect(extractTags('Met #ally and #npc/vampire today\n#todo')).toEqual(['ally', 'npc/vampire', 'todo'])
  })
  const pages = ['Barovia/Village of Barovia.md', 'Vallaki/Inn.md', 'Barovia/Inn.md', 'Strahd.md']
  it('matches a bare name anywhere, case-insensitively', () => {
    expect(resolveLink('strahd', 'Vallaki/Inn.md', pages)).toEqual({ path: 'Strahd.md', ambiguous: false })
    expect(resolveLink('Nobody', 'x.md', pages)).toBeNull()
  })
  it('prefers the page nearest the linking page when two share a name, and marks it ambiguous', () => {
    expect(resolveLink('Inn', 'Barovia/Village of Barovia.md', pages)).toEqual({ path: 'Barovia/Inn.md', ambiguous: true })
    expect(resolveLink('Inn', 'Vallaki/Notes.md', pages)).toEqual({ path: 'Vallaki/Inn.md', ambiguous: true })
    // a tie goes to the first alphabetically
    expect(resolveLink('Inn', 'Other/Page.md', pages)).toEqual({ path: 'Barovia/Inn.md', ambiguous: true })
  })
  it('path links must match the whole path', () => {
    expect(resolveLink('Vallaki/Inn', 'Strahd.md', pages)).toEqual({ path: 'Vallaki/Inn.md', ambiguous: false })
    expect(resolveLink('Inn/Vallaki', 'Strahd.md', pages)).toBeNull()
  })
  it('opens a folder note when the folder is clicked', () => {
    const p = ['A. Old Svalich Road/Old Svalich Road.md', 'A. Old Svalich Road/Other.md']
    expect(folderNote('A. Old Svalich Road', p)).toBeNull() // name differs: folder is "A. Old..." and note "Old..."
    expect(folderNote('Road', ['Road/Road.md'])).toBe('Road/Road.md')
  })
  it('lists the pages that link to a page', () => {
    const all = ['A.md', 'B.md', 'C.md']
    const texts = [{ path: 'A.md', text: 'see [[B]]' }, { path: 'C.md', text: 'nothing' }, { path: 'B.md', text: '[[B]]' }]
    expect(backlinks('B.md', texts, all)).toEqual(['A.md'])
  })
})

describe('rename', () => {
  it('rewrites links to the old name and keeps headings and labels', () => {
    const text = '[[Old]] [[Old|x]] [[Old#h]] [[Other]] ![[Old]] [[Dir/Old]]'
    expect(rewriteLinksOnRename(text, 'Old.md', 'New.md')).toBe('[[New]] [[New|x]] [[New#h]] [[Other]] ![[New]] [[Dir/Old]]')
  })
  it('rewrites path links by full path', () => {
    expect(rewriteLinksOnRename('[[Dir/Old]] [[Old]]', 'Dir/Old.md', 'Dir/New.md')).toBe('[[Dir/New]] [[New]]')
  })
  it('leaves text without matching links exactly as it was', () => {
    const text = 'No links here [[Else]]'
    expect(rewriteLinksOnRename(text, 'Old.md', 'New.md')).toBe(text)
  })
})

describe('path safety', () => {
  it('accepts plain relative paths and refuses anything that could leave the folder', () => {
    expect(isSafeRelativePath('Barovia/Village.md')).toBe(true)
    for (const bad of ['', '../x.md', 'a/../../x.md', '/etc/x', 'C:\\x.md', '\\\\server\\x', 'a//b.md']) {
      expect(isSafeRelativePath(bad), bad).toBe(false)
    }
  })
})
