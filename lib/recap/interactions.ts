// recap 전용 Slack 인터랙션(버튼·모달) 처리. 라우트에서 분리해 의존성을 주입받는다.
// 런타임에 Slack 클라이언트를 import하지 않는다: 라우트가 recapSlack 등을 deps로 넘긴다.
import type { WebClient } from '@slack/web-api'
import { verifySlackSignature } from '@/lib/one-on-one/slackSignature'
import { RECAP_ACTIONS, buildSentBlocks, unescapeSlack } from './format'
import type { SendRecapResult } from './sendRecap'

export type SignedBy = 'booking' | 'recap' | 'both'

/**
 * 어느 Slack 앱의 서명인지 판별한다. 비어 있는 비밀은 그 앱을 거부한다(fail-closed).
 * 'both'는 두 비밀이 같은 값으로 설정된 경우에만 나온다 → 호출자는 action 소속으로 구분한다.
 */
export function resolveSignedBy(
  args: { body: string; timestamp: string | null; signature: string | null; now?: number },
  secrets: { booking?: string; recap?: string },
): SignedBy | null {
  const booking = verifySlackSignature({ ...args, secret: secrets.booking ?? '' })
  const recap = verifySlackSignature({ ...args, secret: secrets.recap ?? '' })
  if (booking && recap) return 'both'
  if (booking) return 'booking'
  if (recap) return 'recap'
  return null
}

type Payload = Record<string, unknown>

/** `payload=` 폼 필드를 안전하게 파싱한다. 없거나 깨졌거나 객체가 아니면 null. */
export function parseInteractionPayload(body: string): Payload | null {
  try {
    const raw = new URLSearchParams(body).get('payload')
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Payload
  } catch {
    return null
  }
}

function obj(v: unknown): Payload {
  return v && typeof v === 'object' ? (v as Payload) : {}
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function firstAction(payload: Payload): Payload {
  return Array.isArray(payload.actions) ? obj(payload.actions[0]) : {}
}

export type InteractionRoute = 'recap' | 'booking_confirm' | 'booking_cancel' | 'ignore'

/**
 * 어떤 핸들러를 실행할지 정한다. recap 요청은 recap 앱 서명일 때만, booking 요청은
 * booking 앱 서명일 때만 처리한다('both' = 같은 비밀 → action 소속으로 결정).
 */
export function dispatchInteraction(payload: Payload, signedBy: SignedBy): InteractionRoute {
  const recapOk = signedBy === 'recap' || signedBy === 'both'
  const bookingOk = signedBy === 'booking' || signedBy === 'both'

  // view_submission에는 actions가 없으므로 먼저 분기한다.
  if (payload.type === 'view_submission') {
    return recapOk && str(obj(payload.view).callback_id) === RECAP_ACTIONS.editSubmit ? 'recap' : 'ignore'
  }

  const actionId = str(firstAction(payload).action_id)
  if (payload.type === 'block_actions' && (actionId === RECAP_ACTIONS.send || actionId === RECAP_ACTIONS.edit)) {
    return recapOk ? 'recap' : 'ignore'
  }
  // 기존 booking 경로는 payload.type을 보지 않았다 → 그대로 유지.
  if (actionId === 'confirm_1on1') return bookingOk ? 'booking_confirm' : 'ignore'
  if (actionId === 'cancel_1on1') return bookingOk ? 'booking_cancel' : 'ignore'
  return 'ignore'
}

export interface RecapInteractionDeps {
  slack: Pick<WebClient, 'chat' | 'views'>
  getAdminId: (slackUserId: string) => string | null
  sendRecap: (args: {
    sessionId: string
    adminId: string
    textOverride?: string
    expectedDraftTs?: string
  }) => Promise<SendRecapResult>
}

export type RecapInteractionResponse =
  | Record<string, never>
  | { response_action: 'clear' }
  | { response_action: 'errors'; errors: { recap_text: string } }

const MSG = {
  notAdmin: 'recap 발송은 Admin만 할 수 있어요.',
  alreadySent: '이미 발송됐어요.',
  stale: '이미 새 초안으로 대체됐어요. 최신 초안에서 발송해 주세요.',
  cannotSend: '이 세션은 지금 발송할 수 없어요.',
  noSlackUser: '챔피언의 Slack 계정을 이메일로 찾지 못했어요.',
  dmFailed: '챔피언에게 DM을 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
  empty: '보낼 내용을 입력해 주세요.',
} as const

const MODAL_TEXT_MAX = 3000

function adminLabel(adminId: string): string {
  return adminId.charAt(0).toUpperCase() + adminId.slice(1)
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error'
}

/** Slack UI 호출은 best-effort: 실패해도 throw하지 않는다. */
async function safe(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`[recap] Slack ${label} failed:`, errMsg(err))
  }
}

function failureMessage(reason: Exclude<SendRecapResult, { ok: true }>['reason']): string {
  switch (reason) {
    case 'already_sent':
      return MSG.alreadySent
    case 'stale_draft':
      return MSG.stale
    case 'no_slack_user':
      return MSG.noSlackUser
    case 'dm_failed':
      return MSG.dmFailed
    default:
      return MSG.cannotSend
  }
}

async function updateDraftAsSent(
  deps: RecapInteractionDeps,
  draft: { channel: string; ts: string },
  adminId: string,
  result: Extract<SendRecapResult, { ok: true }>,
) {
  await safe('chat.update', () =>
    deps.slack.chat.update({
      channel: draft.channel,
      ts: draft.ts,
      text: `${result.championName} 챔피언에게 recap을 발송했어요`,
      blocks: buildSentBlocks({
        championName: result.championName,
        sentByLabel: adminLabel(adminId),
        sentAt: result.sentAt,
      }),
    }),
  )
}

/** 초안 메시지의 본문(section mrkdwn, 이미 escape된 recap 문구)을 사람이 읽는 문구로 되돌린다. */
function draftTextFromMessage(message: Payload): string {
  const blocks = Array.isArray(message.blocks) ? message.blocks : []
  for (const b of blocks) {
    const block = obj(b)
    const text = obj(block.text)
    if (block.type === 'section' && typeof text.text === 'string') {
      return unescapeSlack(text.text).slice(0, MODAL_TEXT_MAX)
    }
  }
  return ''
}

async function handleBlockAction(deps: RecapInteractionDeps, payload: Payload): Promise<RecapInteractionResponse> {
  const action = firstAction(payload)
  const actionId = str(action.action_id)
  const sessionId = str(action.value)
  const userId = str(obj(payload.user).id)
  const channel = str(obj(payload.channel).id)
  const message = obj(payload.message)
  const ts = str(message.ts)

  const ephemeral = (text: string) =>
    safe('chat.postEphemeral', () => deps.slack.chat.postEphemeral({ channel, user: userId, text }))

  const adminId = deps.getAdminId(userId)
  if (!adminId) {
    await ephemeral(MSG.notAdmin)
    return {}
  }
  if (!sessionId || !channel || !ts) {
    console.error('[recap] block action missing session/channel/ts')
    return {}
  }

  if (actionId === RECAP_ACTIONS.edit) {
    // trigger_id는 3초 뒤 만료 → 다른 async 호출보다 먼저 연다. 문구는 클릭된 메시지에서 꺼낸다(DB 조회 없음).
    await safe('views.open', () =>
      deps.slack.views.open({
        trigger_id: str(payload.trigger_id),
        view: {
          type: 'modal',
          callback_id: RECAP_ACTIONS.editSubmit,
          private_metadata: JSON.stringify({ sessionId, channel, ts }),
          title: { type: 'plain_text', text: 'recap 수정 후 발송' },
          submit: { type: 'plain_text', text: '발송하기' },
          close: { type: 'plain_text', text: '취소' },
          blocks: [
            {
              type: 'input',
              block_id: 'recap_text',
              label: { type: 'plain_text', text: '챔피언에게 보낼 문구' },
              element: {
                type: 'plain_text_input',
                action_id: 'value',
                multiline: true,
                max_length: MODAL_TEXT_MAX,
                initial_value: draftTextFromMessage(message),
              },
            },
          ],
        },
      }),
    )
    return {}
  }

  // recap_send
  const result = await deps.sendRecap({ sessionId, adminId, expectedDraftTs: ts })
  if (result.ok) {
    await updateDraftAsSent(deps, { channel, ts }, adminId, result)
  } else if (result.reason === 'no_slack_user' || result.reason === 'dm_failed') {
    await safe('chat.postMessage', () =>
      deps.slack.chat.postMessage({ channel, thread_ts: ts, text: failureMessage(result.reason) }),
    )
  } else {
    await ephemeral(failureMessage(result.reason))
  }
  return {}
}

function parseMetadata(raw: unknown): { sessionId: string; channel: string; ts: string } | null {
  try {
    const m = obj(JSON.parse(str(raw)))
    const sessionId = str(m.sessionId)
    const channel = str(m.channel)
    const ts = str(m.ts)
    return sessionId && channel && ts ? { sessionId, channel, ts } : null
  } catch {
    return null
  }
}

async function handleEditSubmit(deps: RecapInteractionDeps, payload: Payload): Promise<RecapInteractionResponse> {
  const view = obj(payload.view)
  const userId = str(obj(payload.user).id)
  const adminId = deps.getAdminId(userId)
  if (!adminId) {
    // 모달 제출에는 채널이 없다: 보내지 않고 닫는다.
    console.error('[recap] non-admin modal submit ignored')
    return { response_action: 'clear' }
  }

  const meta = parseMetadata(view.private_metadata)
  if (!meta) {
    console.error('[recap] modal submit with invalid private_metadata')
    return { response_action: 'errors', errors: { recap_text: MSG.cannotSend } }
  }

  const text = str(obj(obj(obj(obj(view.state).values).recap_text).value).value)
  if (text.trim() === '') {
    return { response_action: 'errors', errors: { recap_text: MSG.empty } }
  }

  // escape는 sendRecapToChampion이 한 번만 한다 → 입력 그대로 넘긴다.
  const result = await deps.sendRecap({
    sessionId: meta.sessionId,
    adminId,
    textOverride: text,
    expectedDraftTs: meta.ts,
  })
  if (result.ok) {
    await updateDraftAsSent(deps, meta, adminId, result)
    return { response_action: 'clear' }
  }
  if (result.reason === 'already_sent') return { response_action: 'clear' }
  return { response_action: 'errors', errors: { recap_text: failureMessage(result.reason) } }
}

/**
 * recap 버튼(`recap_send`/`recap_edit`)과 수정 모달(`recap_edit_submit`)을 처리한다.
 * 반환값은 Slack에 돌려줄 응답 본문이다. 절대 throw하지 않는다.
 */
export async function handleRecapAction(
  deps: RecapInteractionDeps,
  payload: Payload,
): Promise<RecapInteractionResponse> {
  try {
    if (payload.type === 'view_submission') {
      if (str(obj(payload.view).callback_id) !== RECAP_ACTIONS.editSubmit) return {}
      return await handleEditSubmit(deps, payload)
    }
    if (payload.type === 'block_actions') {
      const actionId = str(firstAction(payload).action_id)
      if (actionId === RECAP_ACTIONS.send || actionId === RECAP_ACTIONS.edit) {
        return await handleBlockAction(deps, payload)
      }
    }
    return {}
  } catch (err) {
    console.error('[recap] interaction failed:', errMsg(err))
    return {}
  }
}
