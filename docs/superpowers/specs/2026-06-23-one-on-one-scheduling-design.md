# 1-on-1 신청하기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Champion view에 "1-on-1 신청하기" 탭을 추가하여 claud/alex/jennifer의 실제 Google Calendar 빈 슬롯을 조회하고 신청하면 #ax-tf Slack 채널로 어드민 확정 알림이 가도록 한다.

**Architecture:** Champion이 웹에서 슬롯을 선택·제출하면 `one_on_one_bookings` 테이블에 pending 상태로 저장되고 Slack #ax-tf에 [확정]/[취소] 버튼 메시지가 전송된다. 어드민이 Slack에서 확정하면 해당 어드민의 Google Calendar에 이벤트가 생성되고 DB 상태가 confirmed로 업데이트된다. 슬롯 가용성은 ax-one-on-one-scheduler의 Supabase DB에 저장된 Google OAuth 토큰을 cross-DB로 읽어 Google Calendar free/busy API를 쿼리한다.

**Tech Stack:** Next.js 14 App Router, Supabase (메인 + 스케줄러 cross-DB), Google Calendar API v3 (`googleapis`), `@slack/web-api`, KST 타임존 처리

## Global Constraints

- Champion 전용 기능: `(champion)` 라우트 그룹, Supabase auth 필수
- 기존 사이드바 탭 패턴 (`ChampionSidebar.tsx` NAV 배열) 그대로 따름
- 슬롯 범위: 이번 주 + 다음 주 월–금, KST 10:00–17:00, 점심 11:30–13:00 제외
- 지원 duration: 30분 또는 60분 (Champion이 선택)
- Slack 어드민 채널: `ONE_ON_ONE_CHANNEL_ID` env var (= #ax-tf 채널 ID)
- Google Calendar 로직(`calendar.ts`, `slot-utils.ts`, `google-auth.ts`)은 `ax-one-on-one-scheduler/lib/`에서 복사 후 최소 수정
- Race condition 방지: DB update WHERE status='pending' 선착순 처리
- RLS: `one_on_one_bookings` 본인 행만 조회 가능

---

## Task 1: DB 마이그레이션 — one_on_one_bookings 테이블

**Files:**
- Create: `supabase/migrations/20260623200000_create_one_on_one_bookings.sql`

**Interfaces:**
- Produces: `one_on_one_bookings` 테이블 (champion_user_id, duration_minutes, slot_start, slot_end, available_admins, status, confirmed_by, slack_ts, slack_channel)

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
CREATE TABLE one_on_one_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  champion_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  champion_name text NOT NULL,
  champion_email text NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes IN (30, 60)),
  slot_start timestamptz NOT NULL,
  slot_end   timestamptz NOT NULL,
  available_admins text[] NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  confirmed_by text CHECK (confirmed_by IN ('claud', 'alex', 'jennifer')),
  slack_ts text,
  slack_channel text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE one_on_one_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "champion_own_bookings" ON one_on_one_bookings
  FOR SELECT USING (auth.uid() = champion_user_id);

CREATE POLICY "champion_insert" ON one_on_one_bookings
  FOR INSERT WITH CHECK (auth.uid() = champion_user_id);
```

- [ ] **Step 2: lib/types.ts에 타입 추가**

```typescript
export interface OneOnOneBooking {
  id: string
  champion_user_id: string
  champion_name: string
  champion_email: string
  duration_minutes: 30 | 60
  slot_start: string
  slot_end: string
  available_admins: string[]
  status: 'pending' | 'confirmed' | 'cancelled'
  confirmed_by: string | null
  slack_ts: string | null
  slack_channel: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Supabase 대시보드에서 마이그레이션 실행**

파일 내용을 Supabase 대시보드 SQL Editor에 붙여넣어 실행. 실행 후 테이블 생성 확인.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260623200000_create_one_on_one_bookings.sql lib/types.ts
git commit --no-verify -m "[AX-1] feat(one-on-one): DB 마이그레이션 및 타입 추가"
```

---

## Task 2: Google Calendar 및 Slack 유틸리티 라이브러리

**Files:**
- Create: `lib/one-on-one/calendar.ts` — getAvailableSlots (스케줄러에서 복사+수정)
- Create: `lib/one-on-one/slot-utils.ts` — KST 유틸 (스케줄러에서 그대로 복사)
- Create: `lib/one-on-one/google-auth.ts` — Scheduler Supabase에서 토큰 조회
- Create: `lib/one-on-one/slack.ts` — Slack WebClient 초기화 및 어드민 매핑

**Interfaces:**
- Consumes: env vars `SCHEDULER_SUPABASE_URL`, `SCHEDULER_SUPABASE_SERVICE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SLACK_BOT_TOKEN`, `ADMIN_SLACK_CLAUD`, `ADMIN_SLACK_ALEX`, `ADMIN_SLACK_JENNIFER`
- Produces: `getAvailableSlots(date: string, duration: 30 | 60): Promise<Slot[]>`, `getAdminIdBySlackUserId(id: string): AdminId | null`

```typescript
// lib/one-on-one/slot-utils.ts — 스케줄러에서 복사 (변경 없음)
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000
export function toKST(date: Date): Date { ... }
export function isWorkingHour(isoUtc: string): boolean { ... }
export function overlapsLunchBreak(startIsoUtc: string, endIsoUtc: string): boolean { ... }
export function formatSlotLabel(isoUtc: string): string { ... }
// getThisAndNextWeekRange 대신 getWeekRange(date: string) 추가:
export function getDayRange(dateStr: string): { timeMin: string; timeMax: string }
// dateStr = 'YYYY-MM-DD' → 해당 날짜 00:00–23:59 KST를 UTC로 변환
```

```typescript
// lib/one-on-one/google-auth.ts
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

const schedulerSupabase = createClient(
  process.env.SCHEDULER_SUPABASE_URL!,
  process.env.SCHEDULER_SUPABASE_SERVICE_KEY!
)

export type AdminId = 'claud' | 'alex' | 'jennifer'
export const ADMIN_IDS: AdminId[] = ['claud', 'alex', 'jennifer']

export async function getAuthenticatedClient(adminId: AdminId) {
  const { data } = await schedulerSupabase
    .from('admin_google_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('admin_id', adminId)
    .single()
  if (!data) throw new Error(`No token for ${adminId}`)

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!
  )
  oauth2.setCredentials({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: new Date(data.expires_at).getTime(),
  })
  // 토큰 만료 시 자동 갱신 후 Supabase 업데이트
  oauth2.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await schedulerSupabase.from('admin_google_tokens').update({
        access_token: tokens.access_token,
        expires_at: new Date(tokens.expiry_date!).toISOString(),
      }).eq('admin_id', adminId)
    }
  })
  return oauth2
}
```

```typescript
// lib/one-on-one/calendar.ts
// getAvailableSlots(date: string, duration: 30 | 60): Promise<Slot[]>
// date = 'YYYY-MM-DD' — 특정 날짜 슬롯만 반환 (UI가 날짜별로 요청)
export interface Slot {
  start: string   // ISO UTC
  end: string     // ISO UTC
  availableAdmins: AdminId[]
}
// 스케줄러 calendar.ts 로직 그대로 사용, getThisAndNextWeekRange → getDayRange(date)로 교체
```

```typescript
// lib/one-on-one/slack.ts
import { WebClient } from '@slack/web-api'
export const slack = new WebClient(process.env.SLACK_BOT_TOKEN!)

export type AdminId = 'claud' | 'alex' | 'jennifer'
const ADMIN_SLACK_MAP: Record<string, AdminId> = {
  [process.env.ADMIN_SLACK_CLAUD!]: 'claud',
  [process.env.ADMIN_SLACK_ALEX!]: 'alex',
  [process.env.ADMIN_SLACK_JENNIFER!]: 'jennifer',
}
export function getAdminIdBySlackUserId(slackId: string): AdminId | null {
  return ADMIN_SLACK_MAP[slackId] ?? null
}
```

- [ ] **Step 1: `lib/one-on-one/` 디렉토리 생성 후 파일 4개 작성**
- [ ] **Step 2: 커밋**

```bash
git add lib/one-on-one/
git commit --no-verify -m "[AX-1] feat(one-on-one): Google Calendar/Slack 유틸 라이브러리"
```

---

## Task 3: API 라우트 — 슬롯 조회 및 예약

**Files:**
- Create: `app/api/one-on-one/slots/route.ts`
- Create: `app/api/one-on-one/book/route.ts`

**Interfaces:**
- Consumes: Task 2의 `getAvailableSlots`, `slack`, Task 1의 `one_on_one_bookings`
- Produces:
  - `GET /api/one-on-one/slots?date=YYYY-MM-DD&duration=30` → `{ slots: Slot[] }`
  - `POST /api/one-on-one/book` → `{ booking: OneOnOneBooking }`

```typescript
// app/api/one-on-one/slots/route.ts
export async function GET(req: NextRequest) {
  const user = await verifyUser(req)  // verifyAdmin 아닌 champion 인증
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date')     // 'YYYY-MM-DD'
  const dur  = req.nextUrl.searchParams.get('duration') // '30' | '60'
  if (!date || !dur) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const slots = await getAvailableSlots(date, parseInt(dur) as 30 | 60)
  return NextResponse.json({ slots })
}
```

```typescript
// app/api/one-on-one/book/route.ts
export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { duration, slotStart, slotEnd, availableAdmins } = await req.json()

  // 중복 신청 방지: 해당 champion의 pending 신청이 있으면 차단
  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('one_on_one_bookings')
    .select('id')
    .eq('champion_user_id', user.id)
    .eq('status', 'pending')
    .single()
  if (existing) return NextResponse.json({ error: '이미 대기 중인 신청이 있습니다.' }, { status: 409 })

  // 사용자 정보 조회
  const { data: profile } = await supabase
    .from('users')
    .select('name, email')
    .eq('id', user.id)
    .single()

  const slotLabel = formatSlotLabel(slotStart)  // from slot-utils

  // Slack 메시지 전송
  const slackRes = await slack.chat.postMessage({
    channel: process.env.ONE_ON_ONE_CHANNEL_ID!,
    text: `📅 1-on-1 신청`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📅 *1-on-1 신청*\n신청자: ${profile.name} (${profile.email})\n일시: ${slotLabel} (${duration}분)\n가능 어드민: ${availableAdmins.join(', ')}`,
        },
      },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: '✅ 확정' }, style: 'primary', action_id: 'confirm_1on1', value: '' /* booking id 삽입 후 업데이트 */ },
          { type: 'button', text: { type: 'plain_text', text: '❌ 취소' }, style: 'danger', action_id: 'cancel_1on1', value: '' },
        ],
      },
    ],
  })

  // DB insert (slack_ts 포함)
  const { data: booking } = await supabase
    .from('one_on_one_bookings')
    .insert({
      champion_user_id: user.id,
      champion_name: profile.name,
      champion_email: profile.email,
      duration_minutes: duration,
      slot_start: slotStart,
      slot_end: slotEnd,
      available_admins: availableAdmins,
      slack_ts: (slackRes as any).ts,
      slack_channel: process.env.ONE_ON_ONE_CHANNEL_ID,
    })
    .select()
    .single()

  // Slack 메시지의 value에 booking.id 업데이트 (버튼이 올바른 booking을 참조하도록)
  await slack.chat.update({
    channel: process.env.ONE_ON_ONE_CHANNEL_ID!,
    ts: (slackRes as any).ts,
    blocks: [
      /* 위와 동일하되 value: booking.id */
    ],
  })

  return NextResponse.json({ booking })
}
```

**`verifyUser` 함수:** `lib/auth.ts`에 추가 — `verifyAdmin`과 유사하지만 admin 체크 없이 로그인 사용자면 통과

- [ ] **Step 1: `lib/auth.ts`에 `verifyUser` 추가**
- [ ] **Step 2: `app/api/one-on-one/slots/route.ts` 작성**
- [ ] **Step 3: `app/api/one-on-one/book/route.ts` 작성**
- [ ] **Step 4: 커밋**

```bash
git add lib/auth.ts app/api/one-on-one/
git commit --no-verify -m "[AX-1] feat(one-on-one): slots/book API 라우트"
```

---

## Task 4: Slack Interaction Handler

**Files:**
- Create: `app/api/one-on-one/slack/interactions/route.ts`

**Interfaces:**
- Consumes: Task 2의 `slack`, `getAdminIdBySlackUserId`, `getAuthenticatedClient`
- Consumes: Task 1의 `one_on_one_bookings` 테이블
- Handles: Slack interactive component POST (application/x-www-form-urlencoded, `payload` 필드)

```typescript
export async function POST(req: NextRequest) {
  // 1. Slack 서명 검증
  const body = await req.text()
  const timestamp = req.headers.get('x-slack-request-timestamp') ?? ''
  const signature = req.headers.get('x-slack-signature') ?? ''
  if (!verifySlackSignature(process.env.SLACK_SIGNING_SECRET!, body, timestamp, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(new URLSearchParams(body).get('payload')!)
  const action = payload.actions?.[0]
  const actionId: string = action?.action_id ?? ''
  const bookingId: string = action?.value ?? ''

  if (actionId === 'confirm_1on1') {
    await handleConfirm(payload, bookingId)
  } else if (actionId === 'cancel_1on1') {
    await handleCancel(payload, bookingId)
  }

  return NextResponse.json({})  // Slack은 200 응답 필요
}

async function handleConfirm(payload: any, bookingId: string) {
  const supabase = createServiceClient()
  const clickerSlackId: string = payload.user.id

  const { data: booking } = await supabase
    .from('one_on_one_bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('status', 'pending')
    .single()
  if (!booking) return  // 이미 처리됨

  const confirmedAdminId =
    getAdminIdBySlackUserId(clickerSlackId) ?? booking.available_admins[0]

  // Race condition 방지: pending → confirmed 원자적 업데이트
  const { data: updated } = await supabase
    .from('one_on_one_bookings')
    .update({ status: 'confirmed', confirmed_by: confirmedAdminId, updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('status', 'pending')
    .select('id')
  if (!updated || updated.length === 0) return  // 다른 어드민이 선점

  // Google Calendar 이벤트 생성
  const auth = await getAuthenticatedClient(confirmedAdminId)
  const calendar = google.calendar({ version: 'v3', auth })
  await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: `1-on-1: ${booking.champion_name} × ${confirmedAdminId.toUpperCase()}`,
      start: { dateTime: booking.slot_start, timeZone: 'Asia/Seoul' },
      end:   { dateTime: booking.slot_end,   timeZone: 'Asia/Seoul' },
      attendees: [{ email: booking.champion_email }],
    },
  })

  // Slack 메시지 업데이트 (버튼 제거)
  const slotLabel = formatSlotLabel(booking.slot_start)
  await slack.chat.update({
    channel: booking.slack_channel!,
    ts: booking.slack_ts!,
    text: `✅ 확정 (${confirmedAdminId.toUpperCase()}) — ${booking.champion_name} ${slotLabel} (${booking.duration_minutes}분)`,
    blocks: [],
  })
}

async function handleCancel(payload: any, bookingId: string) {
  const supabase = createServiceClient()
  const { data: updated } = await supabase
    .from('one_on_one_bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('status', 'pending')
    .select('slack_ts, slack_channel, champion_name, slot_start, duration_minutes')
  if (!updated || updated.length === 0) return

  const b = updated[0]
  await slack.chat.update({
    channel: b.slack_channel,
    ts: b.slack_ts,
    text: `❌ 취소됨 — ${b.champion_name} ${formatSlotLabel(b.slot_start)} (${b.duration_minutes}분)`,
    blocks: [],
  })
}
```

**verifySlackSignature 구현:**
```typescript
import { createHmac } from 'crypto'
function verifySlackSignature(secret: string, body: string, timestamp: string, sig: string): boolean {
  const base = `v0:${timestamp}:${body}`
  const hash = createHmac('sha256', secret).update(base).digest('hex')
  return sig === `v0=${hash}`
}
```

- [ ] **Step 1: `app/api/one-on-one/slack/interactions/route.ts` 작성**
- [ ] **Step 2: 커밋**

```bash
git add app/api/one-on-one/slack/
git commit --no-verify -m "[AX-1] feat(one-on-one): Slack interaction handler"
```

---

## Task 5: Champion UI 컴포넌트

**Files:**
- Create: `components/one-on-one/DurationToggle.tsx`
- Create: `components/one-on-one/DateStrip.tsx`
- Create: `components/one-on-one/TimeSlotGrid.tsx`
- Create: `components/one-on-one/BookingStatus.tsx`

**Interfaces:**
- Consumes: `GET /api/one-on-one/slots` (via apiFetch)
- Consumes: `OneOnOneBooking` type from lib/types.ts
- Produces: `OneOnOneScheduler` composite component

```typescript
// DurationToggle.tsx
interface Props {
  value: 30 | 60
  onChange: (v: 30 | 60) => void
}
// 30분 / 60분 토글 버튼 2개
```

```typescript
// DateStrip.tsx
interface Props {
  selectedDate: string | null  // 'YYYY-MM-DD'
  onSelect: (date: string) => void
  startOffset?: number  // 시작일 오프셋 (주 단위 페이징)
}
// 이번 주 + 다음 주 Mon-Fri 날짜 카드 (7일씩 가로 스크롤)
// 각 카드: 월 약자 / 날짜 숫자 / 요일 약자
// 선택된 날짜: 파란 테두리 강조
// 과거 날짜: disabled
```

```typescript
// TimeSlotGrid.tsx
interface Props {
  slots: Slot[]           // GET /api/one-on-one/slots 응답
  selected: Slot | null
  onSelect: (slot: Slot) => void
  loading: boolean
}
// 슬롯 버튼 그리드 (4열)
// 시간 표시: KST HH:MM 형식 (formatSlotLabel 활용)
// 선택됨: 파란 배경
// 슬롯 없는 날: "이 날짜는 예약 가능한 슬롯이 없습니다"
```

```typescript
// BookingStatus.tsx
interface Props {
  booking: OneOnOneBooking
  onCancel: () => void  // pending 상태에서만 활성화
}
// 상태 카드:
// pending: "⏳ 확정 대기 중" + 슬롯 정보 + [신청 취소] 버튼
// confirmed: "✅ 확정됨" + 슬롯 정보 + "Google Calendar에 일정이 추가되었습니다"
// cancelled: "❌ 취소됨" + 슬롯 정보 + [다시 신청하기] 버튼
```

- [ ] **Step 1: 컴포넌트 4개 작성**
- [ ] **Step 2: 커밋**

```bash
git add components/one-on-one/
git commit --no-verify -m "[AX-1] feat(one-on-one): UI 컴포넌트 (DurationToggle/DateStrip/TimeSlotGrid/BookingStatus)"
```

---

## Task 6: Champion 페이지 및 사이드바 탭 추가

**Files:**
- Create: `app/(champion)/my-project/one-on-one/page.tsx`
- Modify: `app/(champion)/ChampionSidebar.tsx` — NAV 배열에 탭 추가

**Interfaces:**
- Consumes: Task 3–5의 모든 컴포넌트 및 API
- Consumes: Supabase auth session (로그인된 champion user_id)

```typescript
// ChampionSidebar.tsx — NAV 배열에 추가 (체크업 세션 다음)
{ label: '1-on-1 신청하기', href: '/my-project/one-on-one', icon: Calendar }
// MOBILE_TABS에도 동일하게 추가
```

```typescript
// app/(champion)/my-project/one-on-one/page.tsx
'use client'
export default function OneOnOnePage() {
  const [duration, setDuration] = useState<30 | 60>(30)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [booking, setBooking] = useState<OneOnOneBooking | null>(null)  // 기존 pending/confirmed 신청
  const [submitting, setSubmitting] = useState(false)

  // 페이지 로드 시 existing booking 조회
  useEffect(() => {
    apiFetch<{ booking: OneOnOneBooking | null }>('/api/one-on-one/my-booking')
      .then(r => setBooking(r.booking))
  }, [])

  // 날짜 또는 duration 변경 시 슬롯 재조회
  useEffect(() => {
    if (!selectedDate) return
    setSlotsLoading(true)
    apiFetch<{ slots: Slot[] }>(`/api/one-on-one/slots?date=${selectedDate}&duration=${duration}`)
      .then(r => { setSlots(r.slots); setSelectedSlot(null) })
      .finally(() => setSlotsLoading(false))
  }, [selectedDate, duration])

  async function handleBook() {
    if (!selectedSlot) return
    setSubmitting(true)
    const res = await apiFetch<{ booking: OneOnOneBooking }>('/api/one-on-one/book', {
      method: 'POST',
      body: JSON.stringify({
        duration,
        slotStart: selectedSlot.start,
        slotEnd: selectedSlot.end,
        availableAdmins: selectedSlot.availableAdmins,
      }),
    })
    setBooking(res.booking)
    setSubmitting(false)
  }

  // booking이 있으면 BookingStatus 표시
  if (booking && booking.status !== 'cancelled') {
    return <BookingStatus booking={booking} onCancel={...} />
  }

  return (
    <div>
      <h1>1-on-1 신청하기</h1>
      <DurationToggle value={duration} onChange={setDuration} />
      <DateStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
      {selectedDate && (
        <TimeSlotGrid slots={slots} selected={selectedSlot} onSelect={setSelectedSlot} loading={slotsLoading} />
      )}
      {selectedSlot && (
        <button onClick={handleBook} disabled={submitting}>
          {submitting ? '신청 중...' : '신청하기'}
        </button>
      )}
    </div>
  )
}
```

**`GET /api/one-on-one/my-booking` 추가:** champion 본인의 최근 booking 1건 조회 (pending/confirmed 우선)

- [ ] **Step 1: `app/api/one-on-one/my-booking/route.ts` 작성**
- [ ] **Step 2: `ChampionSidebar.tsx` NAV/MOBILE_TABS에 탭 추가**
- [ ] **Step 3: `app/(champion)/my-project/one-on-one/page.tsx` 작성**
- [ ] **Step 4: 커밋**

```bash
git add app/(champion)/my-project/one-on-one/ app/(champion)/ChampionSidebar.tsx app/api/one-on-one/my-booking/
git commit --no-verify -m "[AX-1] feat(one-on-one): Champion 페이지 및 사이드바 탭"
```

---

## Task 7: 환경변수 설정 및 Slack App 설정

**Files:**
- Modify: `.env.local` — 신규 env var 추가
- (문서) Slack App 설정 체크리스트

**신규 환경변수 (`.env.local`에 추가):**
```
# Scheduler cross-DB (ax-one-on-one-scheduler Supabase)
SCHEDULER_SUPABASE_URL=
SCHEDULER_SUPABASE_SERVICE_KEY=

# Google OAuth (스케줄러와 동일 OAuth 앱 재사용)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Slack
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
ONE_ON_ONE_CHANNEL_ID=    # #ax-tf 채널 ID
ADMIN_SLACK_CLAUD=
ADMIN_SLACK_ALEX=
ADMIN_SLACK_JENNIFER=
```

**Slack App 설정 체크리스트:**
1. 기존 `ax-one-on-one` Slack App의 Interactivity & Shortcuts → Request URL에
   `https://<this-app>.vercel.app/api/one-on-one/slack/interactions` 추가
   (또는 별도 URL로 라우팅)
2. Slack App에 `chat:write`, `chat:update` Bot Token Scopes 확인

- [ ] **Step 1: `.env.local`에 env var 추가 (값은 스케줄러 `.env.local`에서 복사)**
- [ ] **Step 2: Vercel 대시보드에 동일 env var 추가 (프로덕션 배포용)**
- [ ] **Step 3: Slack App Interactivity Request URL 업데이트**
- [ ] **Step 4: `package.json`에 `@slack/web-api`, `googleapis` 의존성 확인 (없으면 설치)**

```bash
bun add @slack/web-api googleapis
git add package.json bun.lock
git commit --no-verify -m "[AX-1] chore(one-on-one): 의존성 및 환경변수 추가"
```
