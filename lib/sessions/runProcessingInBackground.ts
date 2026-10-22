import { waitUntil } from '@vercel/functions'
import type { SupabaseClient } from '@supabase/supabase-js'
import { processSessionAudio, SummaryParseError } from './processAudio'
import { postRecapDraft } from '@/lib/recap/postDraft'
import { classifyProcessingError, recordProcessingError } from './processingError'

/**
 * 세션 오디오 처리(STT→요약)를 응답 이후 백그라운드에서 실행한다.
 *
 * 라우트는 이 함수를 호출한 뒤 즉시 202를 반환하고, 클라이언트는
 * GET /api/sessions/[sessionId] 의 processing_status 를 폴링한다.
 *
 * 주의:
 * - Vercel `waitUntil` 은 응답 후에도 함수를 살려두지만, 여전히 maxDuration(300s)
 *   상한 안에서 동작한다. Fluid Compute 활성이 전제.
 * - 파이프라인은 status 를 transcribing→summarizing→done/low_quality 로 갱신한다.
 *   SummaryParseError 는 파이프라인 내부에서 status='error'+notes 를 저장한다.
 *   그 외 예외는 여기서 status='error' 로 기록한다(라우트 catch 는 더 이상 실행 안 됨).
 *   → status 가 in-flight 에 stuck 되는 것을 방지(락 stale 복구와 함께 이중 안전망).
 */
export function runProcessingInBackground(
  supabase: SupabaseClient,
  sessionId: string,
  audioPaths: string[],
  durationSec: number,
): void {
  const processing = processSessionAudio(supabase, sessionId, audioPaths, durationSec)
  waitUntil(
    processing.then(
      // 성공(done/low_quality): 이전 실패 원인 코드를 지운다(best-effort, 별도 UPDATE, throw 안 함).
      async () => {
        await recordProcessingError(supabase, sessionId, null)
      },
      async (err: unknown) => {
        if (!(err instanceof SummaryParseError)) {
          // 원인 코드를 먼저 기록한다: 클라이언트는 status=error 를 보면 폴링을 멈추므로,
          // 그 시점에 원인이 이미 있어야 한다. 별도 best-effort UPDATE(throw 안 함).
          // (SummaryParseError 는 processAudio 가 기록)
          await recordProcessingError(supabase, sessionId, classifyProcessingError(err))
          await supabase
            .from('check_up_sessions')
            .update({ processing_status: 'error', updated_at: new Date().toISOString() })
            .eq('id', sessionId)
        }
        console.error(`[session ${sessionId}] background processing failed:`, err)
      },
    ),
  )
  // recap 초안은 별도 체인: 실패해도 위 .catch(status='error')로 번지지 않고 throw도 하지 않는다.
  waitUntil(
    processing
      .then(async (result) => {
        if (result.lowQuality) return
        await postRecapDraft({ supabase }, sessionId)
      })
      // 처리 자체의 실패는 위 체인이 기록한다. 여기서는 unhandled rejection만 막는다.
      .catch(() => {}),
  )
}
