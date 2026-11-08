import { describe, expect, it } from 'vitest'
import { isPlayable, youtubeUrl } from '../../src/renderer/src/dm/musicEngine'

describe('music links', () => {
  it('turns YouTube video and short links into watch addresses', () => {
    expect(youtubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(youtubeUrl('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(youtubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123')).toContain('&list=PLabc123')
    expect(youtubeUrl('https://www.youtube.com/playlist?list=PLabc123')).toBeNull()
  })
  it('refuses other sites, and plays direct audio links', () => {
    expect(youtubeUrl('https://open.spotify.com/track/abc')).toBeNull()
    expect(isPlayable('https://open.spotify.com/track/abc')).toBe(false)
    expect(isPlayable('https://example.com/song.mp3')).toBe(true)
    expect(youtubeUrl('not a link')).toBeNull()
  })
})
