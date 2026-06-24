import { describe, it, expect } from 'vitest'
import { extOf, resolveAudioType, isAcceptedAudio, AUDIO_CONTENT_TYPES } from '@/lib/audio'

describe('audio helpers', () => {
  it('extOf returns lowercase extension', () => {
    expect(extOf('audio.MP3')).toBe('mp3')
    expect(extOf('sessions/abc/audio.webm')).toBe('webm')
    expect(extOf('noext')).toBe('')
  })

  it('isAcceptedAudio accepts supported formats only', () => {
    expect(isAcceptedAudio('rec.wav')).toBe(true)
    expect(isAcceptedAudio('rec.mp3')).toBe(true)
    expect(isAcceptedAudio('rec.m4a')).toBe(true)
    expect(isAcceptedAudio('rec.webm')).toBe(true)
    expect(isAcceptedAudio('rec.txt')).toBe(false)
    expect(isAcceptedAudio('rec')).toBe(false)
  })

  it('resolveAudioType maps known extensions to content-type', () => {
    expect(resolveAudioType('a.mp3')).toEqual({ ext: 'mp3', contentType: AUDIO_CONTENT_TYPES.mp3 })
    expect(resolveAudioType('a.m4a')).toEqual({ ext: 'm4a', contentType: 'audio/mp4' })
    expect(resolveAudioType('a.wav')).toEqual({ ext: 'wav', contentType: 'audio/wav' })
  })

  it('resolveAudioType falls back to mime, then webm', () => {
    expect(resolveAudioType('blob', 'audio/wav')).toEqual({ ext: 'wav', contentType: 'audio/wav' })
    expect(resolveAudioType('blob')).toEqual({ ext: 'webm', contentType: 'audio/webm' })
  })
})
