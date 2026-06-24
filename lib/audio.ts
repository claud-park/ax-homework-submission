// Shared audio constants for session recording upload + processing.
// Used by both the RecordingPanel (client) and the process/reprocess routes (server).

/** Whisper API per-file limit. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // 25MB
export const MAX_AUDIO_MB = 25

/** Accepted upload extensions, mapped to the content-type sent to Storage + Whisper. */
export const AUDIO_CONTENT_TYPES: Record<string, string> = {
  webm: 'audio/webm',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
}

/** Comma-separated list for the file picker `accept` attribute. */
export const AUDIO_ACCEPT = '.wav,.mp3,.m4a,.webm'

/** Extract a lowercase extension from a filename, or '' if none. */
export function extOf(filename: string): string {
  const idx = filename.lastIndexOf('.')
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : ''
}

/**
 * Resolve a safe extension + content-type for an uploaded audio file.
 * Falls back to webm when the extension is unknown.
 */
export function resolveAudioType(filename: string, mimeType?: string): { ext: string; contentType: string } {
  const ext = extOf(filename)
  if (ext && AUDIO_CONTENT_TYPES[ext]) {
    return { ext, contentType: AUDIO_CONTENT_TYPES[ext] }
  }
  // Fall back to mime-based guess, then webm.
  const fromMime = Object.entries(AUDIO_CONTENT_TYPES).find(([, ct]) => ct === mimeType)
  if (fromMime) return { ext: fromMime[0], contentType: fromMime[1] }
  return { ext: 'webm', contentType: 'audio/webm' }
}

/** True if the filename's extension is an accepted audio format. */
export function isAcceptedAudio(filename: string): boolean {
  return !!AUDIO_CONTENT_TYPES[extOf(filename)]
}
