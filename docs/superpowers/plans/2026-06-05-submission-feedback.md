# Submission Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin이 submission을 accepted/declined 처리할 때 피드백을 남기면, champion view에서 읽기 전용으로 표시한다.

**Architecture:** `submissions` 테이블에 `feedback` / `feedback_updated_at` 컬럼을 추가하고, 기존 Admin PATCH API에 feedback 처리를 추가한다. Admin의 상태 변경 confirm 플로우에 textarea를 삽입하고, Champion view의 제출 목록 각 항목 하단에 피드백 블록을 렌더링한다.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL), TypeScript, Tailwind CSS

---

## File Map

| 파일 | 변경 유형 | 역할 |
|------|-----------|------|
| `supabase/migrations/021_submission_feedback.sql` | CREATE | DB 컬럼 추가 |
| `lib/types.ts` | MODIFY | `Submission` 타입에 feedback 필드 추가 |
| `app/api/admin/submissions/[id]/route.ts` | MODIFY | PATCH에서 feedback 저장 |
| `components/SubmissionDetailPanel.tsx` | MODIFY | accepted/declined 확인 시 feedback textarea 추가 |
| `app/(champion)/my-project/submission/SubmissionClient.tsx` | MODIFY | 제출 목록에 feedback 블록 렌더링 |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/021_submission_feedback.sql`

- [ ] **Step 1: migration 파일 생성**

```sql
-- supabase/migrations/021_submission_feedback.sql
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS feedback text,
  ADD COLUMN IF NOT EXISTS feedback_updated_at timestamptz;
```

- [ ] **Step 2: Supabase에 migration 적용**

```bash
npx supabase db push
```

성공하면 터미널에 "Applying migration 021_submission_feedback.sql" 출력.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/021_submission_feedback.sql
git commit -m "[AX-1] feat: submissions 테이블에 feedback 컬럼 추가 (021 migration)"
```

---

## Task 2: TypeScript 타입 업데이트

**Files:**
- Modify: `lib/types.ts`

현재 `Submission` 인터페이스:
```ts
export interface Submission {
  id: string
  user_id: string
  file_path: string | null
  file_name: string | null
  link_url: string | null
  status: SubmissionStatus
  attempt_number: number
  submitted_at: string
  comments?: Comment[]
  user?: User
}
```

- [ ] **Step 1: `Submission` 인터페이스에 feedback 필드 추가**

`lib/types.ts`의 `Submission` 인터페이스를 아래와 같이 수정한다:

```ts
export interface Submission {
  id: string
  user_id: string
  file_path: string | null
  file_name: string | null
  link_url: string | null
  status: SubmissionStatus
  attempt_number: number
  submitted_at: string
  feedback: string | null          // NEW
  feedback_updated_at: string | null  // NEW
  comments?: Comment[]
  user?: User
}
```

- [ ] **Step 2: 타입 오류 없는지 확인**

```bash
npx tsc --noEmit
```

오류 없으면 다음 step으로.

- [ ] **Step 3: 커밋**

```bash
git add lib/types.ts
git commit -m "[AX-1] feat: Submission 타입에 feedback 필드 추가"
```

---

## Task 3: Admin PATCH API — feedback 저장

**Files:**
- Modify: `app/api/admin/submissions/[id]/route.ts`

현재 코드 (전체):
```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { status } = body
  if (!['pending', 'accepted', 'declined'].includes(status))
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('submissions')
    .update({ status })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 1: feedback을 함께 저장하도록 PATCH 수정**

`app/api/admin/submissions/[id]/route.ts`를 아래 내용으로 교체한다:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { status, feedback } = body
  if (!['pending', 'accepted', 'declined'].includes(status))
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const update: Record<string, unknown> = { status }
  if (feedback !== undefined) {
    update.feedback = feedback === '' ? null : feedback
    update.feedback_updated_at = feedback === '' ? null : new Date().toISOString()
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('submissions')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: 타입 오류 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add app/api/admin/submissions/[id]/route.ts
git commit -m "[AX-1] feat: admin submission PATCH에 feedback 저장 추가"
```

---

## Task 4: Admin UI — SubmissionDetailPanel에 feedback 입력 추가

**Files:**
- Modify: `components/SubmissionDetailPanel.tsx`

**변경 전략:**
- 기존 `changeStatus(newStatus)` 함수는 버튼 클릭 즉시 API를 호출한다.
- accepted/declined 클릭 시에는 즉시 호출하지 않고, confirm 단계를 거친다.
- `confirmingStatus: SubmissionStatus | null`과 `feedbackText: string` state를 추가한다.
- confirm 블록은 상태 버튼 섹션 바로 아래에 인라인으로 렌더링된다.

- [ ] **Step 1: state 추가 및 changeStatus 로직 분리**

`components/SubmissionDetailPanel.tsx`에서:

1. import 위치에서 사용하는 useState 목록에 변경 없음 (이미 있음).

2. `updatingStatus` state 아래에 두 state를 추가한다:

```ts
const [confirmingStatus, setConfirmingStatus] = useState<SubmissionStatus | null>(null)
const [feedbackText, setFeedbackText] = useState('')
```

3. 기존 `changeStatus` 함수를 아래로 교체한다 (accepted/declined는 confirm을 통해서만 실행):

```ts
function openConfirm(newStatus: SubmissionStatus) {
  if (newStatus === currentStatus) return
  setConfirmingStatus(newStatus)
  setFeedbackText(latest?.feedback ?? '')
}

async function confirmStatusChange() {
  if (!confirmingStatus) return
  setUpdatingStatus(confirmingStatus)
  try {
    await apiFetch(`/api/admin/submissions/${submissionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: confirmingStatus, feedback: feedbackText }),
    })
    toast.success('상태가 변경되었습니다.')
    setConfirmingStatus(null)
    setFeedbackText('')
    fetchDetail()
    onStatusChanged()
  } catch (e) {
    toast.error('상태 변경 실패: ' + (e as Error).message)
  } finally {
    setUpdatingStatus(null)
  }
}
```

- [ ] **Step 2: 상태 버튼 onClick 로직 변경 및 confirm 블록 추가**

기존 상태 버튼 섹션 (현재 `changeStatus(s)` 호출 부분):

```tsx
{(['pending', 'accepted', 'declined'] as SubmissionStatus[]).map(s => {
  const isActive = s === currentStatus
  const isUpdating = updatingStatus === s
  return (
    <button
      key={s}
      onClick={() => changeStatus(s)}
      ...
    >
```

아래로 교체한다 — accepted/declined는 `openConfirm`, pending은 즉시 `confirmStatusChange` 없이 직접 PATCH:

```tsx
{(['pending', 'accepted', 'declined'] as SubmissionStatus[]).map(s => {
  const isActive = s === currentStatus
  const isUpdating = updatingStatus === s
  const needsConfirm = s === 'accepted' || s === 'declined'
  return (
    <button
      key={s}
      onClick={() => {
        if (needsConfirm) {
          openConfirm(s)
        } else {
          setUpdatingStatus(s)
          apiFetch(`/api/admin/submissions/${submissionId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: s }),
          })
            .then(() => { toast.success('상태가 변경되었습니다.'); fetchDetail(); onStatusChanged() })
            .catch(e => toast.error('상태 변경 실패: ' + (e as Error).message))
            .finally(() => setUpdatingStatus(null))
        }
      }}
      disabled={isActive || updatingStatus !== null || (confirmingStatus !== null && confirmingStatus !== s)}
      className="text-xs rounded-md px-3 py-1.5 font-semibold transition-opacity disabled:cursor-default"
      style={{
        background: isActive ? STATUS_COLOR[s] : confirmingStatus === s ? `${STATUS_COLOR[s]}20` : 'transparent',
        color: isActive ? '#fff' : STATUS_COLOR[s],
        border: `1px solid ${STATUS_COLOR[s]}`,
        opacity: !isActive && updatingStatus !== null ? 0.5 : 1,
      }}
    >
      {isUpdating && <Spinner size="sm" className="inline mr-1" />}
      {STATUS_LABEL[s]}
    </button>
  )
})}
```

상태 버튼 `</div>` 바로 아래 (기존 `</section>` 직전)에 confirm 블록을 추가한다:

```tsx
{confirmingStatus && (
  <div
    className="mt-3 rounded-lg border p-3 flex flex-col gap-2"
    style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-secondary)' }}
  >
    <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
      피드백 <span style={{ color: 'var(--text-disabled)', fontWeight: 400 }}>(선택)</span>
    </label>
    <textarea
      value={feedbackText}
      onChange={e => setFeedbackText(e.target.value)}
      placeholder="이번 제출에 대한 피드백을 남겨주세요"
      rows={3}
      className="w-full text-xs rounded-md border p-2 resize-none"
      style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
    />
    <div className="flex justify-end gap-2">
      <button
        onClick={() => { setConfirmingStatus(null); setFeedbackText('') }}
        className="text-xs px-3 py-1.5 rounded-md font-semibold"
        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
      >
        취소
      </button>
      <button
        onClick={confirmStatusChange}
        disabled={updatingStatus !== null}
        className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-50"
        style={{ background: STATUS_COLOR[confirmingStatus], color: '#fff' }}
      >
        {updatingStatus ? <Spinner size="sm" className="inline mr-1" /> : null}
        {STATUS_LABEL[confirmingStatus]}으로 변경
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 3: 타입 오류 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: 커밋**

```bash
git add components/SubmissionDetailPanel.tsx
git commit -m "[AX-1] feat: admin submission 상태 변경 시 feedback 입력 추가"
```

---

## Task 5: Champion UI — SubmissionClient에 feedback 블록 렌더링

**Files:**
- Modify: `app/(champion)/my-project/submission/SubmissionClient.tsx`

**변경 전략:**
- 제출 목록의 각 항목(`submissions.map`) 내부를 `flex flex-col`로 변경한다.
- 기존 파일/링크+상태배지 row는 유지한다.
- `sub.feedback`이 있을 때만 feedback 블록을 하단에 렌더링한다.

- [ ] **Step 1: 제출 목록 항목에 feedback 블록 추가**

`SubmissionClient.tsx`의 `submissions.map` 내부 `<div key={sub.id} ...>` 전체를 아래로 교체한다:

```tsx
<div
  key={sub.id}
  className="flex flex-col p-4 rounded-xl border gap-3"
  style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
>
  {/* 기존: 파일/링크 + 상태배지 row */}
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3 min-w-0">
      {sub.link_url
        ? <Link className="h-4 w-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
        : <FileCheck className="h-4 w-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
      }
      <div className="min-w-0">
        {sub.link_url ? (
          <a
            href={sub.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium truncate block"
            style={{ color: 'var(--blue-600)' }}
          >
            {sub.link_url}
          </a>
        ) : (
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{sub.file_name}</p>
        )}
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          시도 {sub.attempt_number}회 · {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}
        </p>
      </div>
    </div>
    <span
      className="text-xs font-semibold px-2 py-1 rounded-md shrink-0 ml-3"
      style={{ color: STATUS_COLOR[sub.status], background: `${STATUS_COLOR[sub.status]}20` }}
    >
      {STATUS_LABEL[sub.status]}
    </span>
  </div>

  {/* 관리자 피드백 블록 (feedback 있을 때만) */}
  {sub.feedback && (
    <div
      style={{
        borderLeft: '3px solid var(--blue-600)',
        borderRadius: '0 6px 6px 0',
        background: 'rgba(37,99,235,0.04)',
        padding: '8px 10px 8px 12px',
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-disabled)' }}>
          관리자 피드백
        </span>
        {sub.feedback_updated_at && (
          <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>
            · {new Date(sub.feedback_updated_at).toLocaleString('ko-KR')}
          </span>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {sub.feedback}
      </p>
    </div>
  )}
</div>
```

- [ ] **Step 2: 타입 오류 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add app/\(champion\)/my-project/submission/SubmissionClient.tsx
git commit -m "[AX-1] feat: champion 제출 목록에 관리자 피드백 블록 렌더링"
```

---

## Task 6: 수동 검증 및 배포

- [ ] **Step 1: 개발 서버 실행**

```bash
npm run dev
```

- [ ] **Step 2: Admin 시나리오 검증**

1. `/admin/kanban` 접속
2. 검토 중인 submission이 있는 카드 클릭 → SubmissionDetailPanel 오픈
3. "합격" 또는 "불합격" 버튼 클릭
4. confirm 블록이 펼쳐지는지 확인
5. feedback textarea에 텍스트 입력
6. "합격으로 변경" 버튼 클릭
7. 상태 변경 성공 toast 확인
8. feedback 없이 변경하는 경우(textarea 비움)도 정상 동작 확인

- [ ] **Step 3: Champion 시나리오 검증**

1. `/my-project/submission` 접속
2. 위에서 피드백을 작성한 제출 항목에 "관리자 피드백" 블록이 표시되는지 확인
3. 피드백이 없는 제출에는 블록이 표시되지 않는지 확인

- [ ] **Step 4: 배포**

```bash
vercel --prod
```
