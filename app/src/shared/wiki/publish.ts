// Sharing from the DM's notes to the players. Pure functions, no Electron, so they are easy to test.
//
// In the DM's own notes, any part of a page can be marked for the players with a callout:
//
//   > [!share] The Mists of Barovia            everyone in the party sees this
//   > The fog is thick and cold...
//
//   > [!secret Auriviel] A whisper             only Auriviel sees this
//   > Your tattoos itch as you hear a voice...
//
// Everything else on the page stays private to the DM. "Publish" copies only the marked parts into the
// shared Party Wiki folder (and each player's own private folder for the secrets).

export interface ShareBlock {
  kind: 'share' | 'secret'
  player: string | null // who a secret is for
  title: string
  body: string
}

const HEADER = /^>\s*\[!(share|secret)(?:[ \t]+([^\]]+?))?\][ \t]*(.*)$/i

export function extractShareBlocks(markdown: string): ShareBlock[] {
  const lines = markdown.split(/\r?\n/)
  const blocks: ShareBlock[] = []
  let current: ShareBlock | null = null
  for (const line of lines) {
    const header = line.match(HEADER)
    if (header) {
      current = { kind: header[1].toLowerCase() as 'share' | 'secret', player: header[1].toLowerCase() === 'secret' ? (header[2]?.trim() ?? null) : null, title: header[3].trim(), body: '' }
      blocks.push(current)
    } else if (current && /^>/.test(line)) {
      current.body += `${line.replace(/^>[ \t]?/, '')}\n`
    } else {
      current = null
    }
  }
  return blocks.map((b) => ({ ...b, body: b.body.trim() }))
}

export function hasShareBlocks(markdown: string): boolean {
  return extractShareBlocks(markdown).length > 0
}

// The page the players see: just the shared parts, each under its own heading.
export function buildPublished(pageTitle: string, blocks: ShareBlock[], date: string): string {
  const body = blocks.map((b) => `## ${b.title || 'Notes'}\n\n${b.body}\n`).join('\n')
  return `---\npublished: ${date}\nfrom: ${pageTitle}\n---\n# ${pageTitle}\n\n${body}`
}

export function publishedPath(pagePath: string): string {
  return `DM Shares/${pagePath}`
}

// Plain text for pasting into WhatsApp (which uses *bold* and _italic_).
export function whatsappText(pageTitle: string, blocks: ShareBlock[]): string {
  const parts = blocks.map((b) => `${b.title ? `*${b.title}*\n` : ''}${b.body.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/(^|\s)#+\s*/g, '$1')}`)
  return `*${pageTitle}*\n\n${parts.join('\n\n')}`.trim()
}

// Adds the callout markers around some text ("Mark as shared" in the editor).
export function wrapAsShare(selection: string, title: string): string {
  return wrap(`> [!share] ${title}`.trimEnd(), selection)
}

export function wrapAsSecret(selection: string, player: string, title: string): string {
  return wrap(`> [!secret ${player}] ${title}`.trimEnd(), selection)
}

function wrap(header: string, selection: string): string {
  const quoted = selection.split(/\r?\n/).map((l) => (l.trim() === '' ? '>' : `> ${l}`)).join('\n')
  return `${header}\n${quoted}\n`
}

// "DM Shares/Index.md": what has been published, newest first, so the Party Wiki has a front page.
export function indexMarkdown(entries: { path: string; title: string; date: string }[]): string {
  const rows = [...entries].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))
    .map((e) => `- [[${e.path.replace(/\.md$/i, '')}|${e.title}]] (${e.date})`)
  return `# DM Shares\n\nWhat the DM has shared with the party. Updated every time the DM publishes.\n\n${rows.join('\n')}\n`
}
