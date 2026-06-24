/** Error thrown when Claude returns output we cannot parse as JSON. */
export class SummaryParseError extends Error {
  rawText: string
  constructor(message: string, rawText: string) {
    super(message)
    this.name = 'SummaryParseError'
    this.rawText = rawText
  }
}
