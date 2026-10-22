import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api/guard'
import { postRecapDraft } from '@/lib/recap/postDraft'

type Params = { params: { sessionId: string } }

/** Admin 수동 재게시: 게시 실패한 recap 초안을 다시 Slack 에 올린다. 이미 발송된 세션은 거부한다. */
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const supabase = createServiceClient()
  const result = await postRecapDraft({ supabase, refuseIfSent: true }, params.sessionId)
  if (result.posted) return NextResponse.json({ ok: true })
  return NextResponse.json({
    ok: false,
    reason: result.reason,
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
  })
}
