import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildZip } from '../../src/main/zip'

// Reads the zip back through its central directory, the way an unzip tool does.
function read(zip: Buffer): Record<string, string> {
  const end = zip.length - 22
  expect(zip.readUInt32LE(end)).toBe(0x06054b50)
  const count = zip.readUInt16LE(end + 10)
  let p = zip.readUInt32LE(end + 16)
  const out: Record<string, string> = {}
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10)
    const size = zip.readUInt32LE(p + 20)
    const nameLength = zip.readUInt16LE(p + 28)
    const local = zip.readUInt32LE(p + 42)
    const name = zip.subarray(p + 46, p + 46 + nameLength).toString('utf-8')
    const start = local + 30 + zip.readUInt16LE(local + 26)
    const body = zip.subarray(start, start + size)
    out[name] = (method === 8 ? inflateRawSync(body) : body).toString('utf-8')
    p += 46 + nameLength
  }
  return out
}

describe('zip writer', () => {
  it('round-trips files, including empty and non-English ones', () => {
    const files = { 'characters/Raqib.json': '{"name":"Raqib"}'.repeat(50), 'notes/é ü.md': '# Hi', 'notes/empty.md': '' }
    const zip = buildZip(Object.entries(files).map(([name, text]) => ({ name, data: Buffer.from(text) })))
    expect(read(zip)).toEqual(files)
  })
})
