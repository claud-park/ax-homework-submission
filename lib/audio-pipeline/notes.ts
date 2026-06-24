// Pure helpers for combining user-written meeting notes with the AI summary.
// No external deps so it can be unit-tested without loading the OpenAI/Claude clients.

export const AI_DIVIDER = '\n\n---\n\n**🤖 AI 요약**\n\n'

// Splits on the AI divider tolerantly: any emphasis markers (* _ ** __), 3+ dashes,
// and flexible blank lines — so an editor markdown round-trip can't defeat de-nesting.
const AI_DIVIDER_RE = /\n+-{3,}\n+[*_]*🤖 AI 요약[*_]*\n+/

/**
 * Preserve the user's handwritten notes and append the AI summary below a divider.
 * On reprocess, only the portion before the divider (the user's part) is kept,
 * so summaries never nest.
 */
export function combineSessionNotes(prevNotes: string, summary: string): string {
  const userPart = (prevNotes ?? '').split(AI_DIVIDER_RE)[0].trimEnd()
  return userPart ? `${userPart}${AI_DIVIDER}${summary}` : summary
}
