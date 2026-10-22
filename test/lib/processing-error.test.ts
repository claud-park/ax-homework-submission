import { describe, it, expect, vi, beforeEach } from 'vitest'
import OpenAI from 'openai'
import { APICallError } from '@ai-sdk/provider'
import { RetryError } from 'ai'
import { SummaryParseError } from '@/lib/audio-pipeline/errors'
import {
  classifyProcessingError,
  recordProcessingError,
  isProcessingErrorCode,
  tagProcessingStage,
} from '@/lib/sessions/processingError'

const hdrs = new Headers()
const openaiErr = (status: number, body: Record<string, unknown>) =>
  OpenAI.APIError.generate(status, { error: body }, undefined, hdrs)

const anthropicErr = (statusCode: number, type: string, message: string) =>
  new APICallError({
    message,
    url: 'https://api.anthropic.com/v1/messages',
    requestBodyValues: {},
    statusCode,
    responseBody: JSON.stringify({ type: 'error', error: { type, message } }),
    data: { type: 'error', error: { type, message } },
  })

describe('classifyProcessingError', () => {
  it('OpenAI SDK 429 insufficient_quota -> stt_quota', () => {
    const e = openaiErr(429, { message: 'You exceeded your current quota', code: 'insufficient_quota', type: 'insufficient_quota' })
    expect(classifyProcessingError(e)).toBe('stt_quota')
  })
  it('plain object with status/code -> stt_quota (stage stt)', () => {
    expect(classifyProcessingError({ status: 429, code: 'insufficient_quota', message: '429 You have no credits remaining' }, 'stt')).toBe('stt_quota')
  })
  it('nested error.code -> stt_quota', () => {
    expect(classifyProcessingError({ status: 429, error: { code: 'insufficient_quota' } }, 'stt')).toBe('stt_quota')
  })
  it('Error with only the production message -> stt_quota', () => {
    expect(classifyProcessingError(new Error('429 You have no credits remaining. Add credits to continue.'))).toBe('stt_quota')
  })
  it('"exceeded your current quota" wording -> stt_quota', () => {
    expect(classifyProcessingError(new Error('You exceeded your current quota, please check your plan'))).toBe('stt_quota')
  })
  it('quota with stage summary -> summary_quota', () => {
    expect(classifyProcessingError(new Error('429 You have no credits remaining'), 'summary')).toBe('summary_quota')
  })
  it('OpenAI 429 without quota hint -> stt_rate_limited', () => {
    expect(classifyProcessingError(openaiErr(429, { message: 'Rate limit reached', code: 'rate_limit_exceeded' }))).toBe('stt_rate_limited')
    expect(classifyProcessingError({ status: 429 }, 'stt')).toBe('stt_rate_limited')
  })
  it('OpenAI 401 / 403 -> stt_auth', () => {
    expect(classifyProcessingError(openaiErr(401, { message: 'Incorrect API key', code: 'invalid_api_key' }))).toBe('stt_auth')
    expect(classifyProcessingError(openaiErr(403, { message: 'forbidden' }))).toBe('stt_auth')
  })
  it('Anthropic credit balance too low (400) -> summary_quota', () => {
    const e = anthropicErr(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.')
    expect(classifyProcessingError(e)).toBe('summary_quota')
  })
  it('Anthropic 401 -> summary_auth', () => {
    expect(classifyProcessingError(anthropicErr(401, 'authentication_error', 'invalid x-api-key'))).toBe('summary_auth')
  })
  it('Anthropic quota wrapped in RetryError -> summary_quota', () => {
    const inner = anthropicErr(400, 'invalid_request_error', 'Your credit balance is too low')
    const e = new RetryError({ message: 'Failed after 3 attempts', reason: 'maxRetriesExceeded', errors: [inner, inner] })
    expect(classifyProcessingError(e)).toBe('summary_quota')
  })
  it('Anthropic 429 (no summary rate-limit code) -> upstream_unavailable', () => {
    expect(classifyProcessingError(anthropicErr(429, 'rate_limit_error', 'rate limited'))).toBe('upstream_unavailable')
  })
  it('network / timeout / 5xx -> upstream_unavailable', () => {
    expect(classifyProcessingError(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))).toBe('upstream_unavailable')
    expect(classifyProcessingError(new Error('connect ETIMEDOUT 1.2.3.4:443'))).toBe('upstream_unavailable')
    expect(classifyProcessingError(new TypeError('fetch failed'))).toBe('upstream_unavailable')
    expect(classifyProcessingError(new OpenAI.APIConnectionError({ message: 'Connection error.' }))).toBe('upstream_unavailable')
    expect(classifyProcessingError(openaiErr(503, { message: 'unavailable' }))).toBe('upstream_unavailable')
    expect(classifyProcessingError({ status: 500 })).toBe('upstream_unavailable')
  })
  it('ambiguous 429/401 without stage hints does not guess STT', () => {
    expect(classifyProcessingError({ status: 429 })).toBe('upstream_unavailable')
    expect(classifyProcessingError({ status: 401 })).toBe('unknown')
  })
  it('stage tag from tagProcessingStage is used', () => {
    const e = { status: 401 }
    tagProcessingStage(e, 'summary')
    expect(classifyProcessingError(e)).toBe('summary_auth')
  })
  it('SummaryParseError -> summary_parse', () => {
    expect(classifyProcessingError(new SummaryParseError('x', 'raw'))).toBe('summary_parse')
  })
  it('unclassifiable / non-Error values -> unknown without throwing', () => {
    for (const v of [new Error('boom'), 'string', null, undefined, 42, {}, [], Symbol('s')]) {
      expect(classifyProcessingError(v)).toBe('unknown')
    }
  })
  it('does not throw on hostile objects', () => {
    const hostile = new Proxy({}, { get() { throw new Error('nope') } })
    expect(classifyProcessingError(hostile)).toBe('unknown')
  })
})

describe('recordProcessingError', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

  function sb(result: unknown) {
    const update = vi.fn((_p: unknown) => ({ eq: vi.fn(() => Promise.resolve(result)) }))
    const from = vi.fn(() => ({ update }))
    return { client: { from } as never, update, from }
  }

  it('writes only processing_error', async () => {
    const { client, update, from } = sb({ error: null })
    await recordProcessingError(client, 's1', 'stt_quota')
    expect(from).toHaveBeenCalledWith('check_up_sessions')
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0]).toEqual({ processing_error: 'stt_quota' })
    await recordProcessingError(client, 's1', null)
    expect(update.mock.calls[1][0]).toEqual({ processing_error: null })
  })
  it('logs only the message and does not throw when update returns error', async () => {
    const { client } = sb({ error: { message: 'column does not exist', details: 'SECRET' } })
    await expect(recordProcessingError(client, 's1', 'unknown')).resolves.toBeUndefined()
    const calls = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toHaveLength(1)
    expect(JSON.stringify(calls[0])).toContain('column does not exist')
    expect(JSON.stringify(calls[0])).not.toContain('SECRET')
  })
  it('does not throw when update throws or rejects', async () => {
    const throwing = { from: () => { throw new Error('boom') } } as never
    await expect(recordProcessingError(throwing, 's1', 'unknown')).resolves.toBeUndefined()
    const rejecting = { from: () => ({ update: () => ({ eq: () => Promise.reject(new Error('net')) }) }) } as never
    await expect(recordProcessingError(rejecting, 's1', 'unknown')).resolves.toBeUndefined()
  })
})

describe('isProcessingErrorCode', () => {
  it.each([
    ['stt_quota', true], ['stt_rate_limited', true], ['stt_auth', true], ['summary_quota', true],
    ['summary_auth', true], ['upstream_unavailable', true], ['summary_parse', true], ['unknown', true],
    ['other', false], ['', false], [null, false], [undefined, false], [1, false], ['STT_QUOTA', false],
  ])('%s -> %s', (v, expected) => {
    expect(isProcessingErrorCode(v)).toBe(expected)
  })
})
