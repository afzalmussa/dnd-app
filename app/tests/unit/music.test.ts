import { describe, expect, it } from 'vitest'
import { embedUrl, isPlayable } from '../../src/renderer/src/dm/musicEngine'

describe('music links', () => {
  it('turns YouTube video, short and playlist links into embeds', () => {
    expect(embedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toContain('/embed/dQw4w9WgXcQ?')
    expect(embedUrl('https://youtu.be/dQw4w9WgXcQ')).toContain('/embed/dQw4w9WgXcQ?')
    expect(embedUrl('https://www.youtube.com/playlist?list=PLabc123')).toContain('videoseries')
  })
  it('refuses other sites, and plays direct audio links', () => {
    expect(embedUrl('https://open.spotify.com/track/abc')).toBeNull()
    expect(isPlayable('https://open.spotify.com/track/abc')).toBe(false)
    expect(isPlayable('https://example.com/song.mp3')).toBe(true)
    expect(embedUrl('not a link')).toBeNull()
  })
})
