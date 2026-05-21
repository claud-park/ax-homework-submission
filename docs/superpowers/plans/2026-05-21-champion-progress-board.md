# 챔피언 진척도 보드 완성 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/progress` 페이지에 과제별 요약 테이블(마일스톤 완료율 + 최종 제출 상태)을 추가한다.

**Architecture:** 기존 `/api/milestones` fetch와 `/api/submissions/mine` fetch를 `Promise.all`로 병렬 실행하고, 클라이언트에서 `homework_id`로 조인해 과제별 요약 row를 만든다. `SummaryTable` 컴포넌트는 `page.tsx` 안에 인라인으로 정의한다. 서버 코드 변경 없음.

**Tech Stack:** Next.js 14, React 18, TypeScript, Bun (typecheck 명령: `bun run typecheck`)

---

## 변경 파일

| 파일 | 종류 |
|---|---|
| `app/(champion)/progress/page.tsx` | 수정 — submissions fetch 추가, `SummaryTable` 컴포넌트 추가, JSX 순서 조정 |

---

## Task 1: imports + submissions 상태 + 병렬 fetch

**Files:**
- Modify: `app/(champion)/progress/page.tsx:4` (import)
- Modify: `app/(champion)/progress/page.tsx:53-57` (state + useEffect)

- [ ] **Step 1: import에 `Submission`, `SubmissionStatus` 추가**

파일 4번째 줄을 아래로 교체한다:

```ts
// before
import type { Milestone } from '@/lib/types'

// after
import type { Milestone, Submission, SubmissionStatus } from '@/lib/types'
```

- [ ] **Step 2: `submissions` 상태 추가 + useEffect를 `Promise.all`로 교체**

`ProgressPage` 함수 상단 state + useEffect 블록을 아래로 교체한다:

```tsx
const [milestones, setMilestones] = useState<MilestoneWithHomework[]>([])
const [submissions, setSubmissions] = useState<Submission[]>([])

useEffect(() => {
  Promise.all([
    apiFetch<MilestoneWithHomework[]>('/api/milestones'),
    apiFetch<Submission[]>('/api/submissions/mine'),
  ]).then(([ms, subs]) => {
    setMilestones(ms)
    setSubmissions(subs)
  })
}, [])
```

- [ ] **Step 3: typecheck 통과 확인**

```bash
bun run typecheck
```

Expected: 에러 없음 (또는 이 파일과 무관한 기존 에러만)

---

## Task 2: `SummaryTable` 컴포넌트 추가

**Files:**
- Modify: `app/(champion)/progress/page.tsx` — 파일 상단 상수 블록 뒤, `ProgressPage` 함수 선언 앞에 삽입

- [ ] **Step 1: submission 상태 레이블/색상 상수 추가**

파일 상단 상수 블록(`LEFT_W`, `COL_W` 등이 있는 곳) 바로 아래에 삽입한다:

```ts
const SUB_LABEL: Record<SubmissionStatus, string> = {
  pending: '검토중', accepted: '합격', declined: '불합격',
}
const SUB_COLOR: Record<SubmissionStatus, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}
const SUB_BG: Record<SubmissionStatus, string> = {
  pending: 'rgba(245,158,11,0.12)', accepted: 'rgba(34,197,94,0.12)', declined: 'rgba(248,113,113,0.12)',
}

type SummaryRow = { hwId: number; hwTitle: string; total: number; completed: number }
```

- [ ] **Step 2: `SummaryTable` 컴포넌트 추가**

`type SummaryRow` 바로 아래에 삽입한다:

```tsx
function SummaryTable({ rows, latestSubs }: {
  rows: SummaryRow[]
  latestSubs: Map<number, SubmissionStatus>
}) {
  return (
    <div className="mb-4 rounded-xl overflow-hidden" style={{ border: BORDER }}>
      <div style={{ background: HEADER_BG, borderBottom: BORDER, padding: '7px 14px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>과제 현황</span>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 160px 80px',
        background: HEADER_BG, borderBottom: BORDER,
        padding: '5px 14px',
        fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em',
      }}>
        <span>과제</span>
        <span>마일스톤 진행률</span>
        <span>최종 제출</span>
      </div>
      {rows.map((row, i) => {
        const pct = row.total > 0 ? (row.completed / row.total) * 100 : 0
        const subStatus = latestSubs.get(row.hwId) ?? null
        return (
          <div key={row.hwId} style={{
            display: 'grid', gridTemplateColumns: '1fr 160px 80px',
            padding: '9px 14px', alignItems: 'center',
            borderBottom: i < rows.length - 1 ? BORDER : 'none',
            background: '#fff',
          }}>
            <div>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                {row.hwTitle}
              </p>
              <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 0' }}>
                과제 #{String(row.hwId).padStart(2, '0')}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '12px' }}>
              <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: '#e2e8f0' }}>
                <div style={{
                  width: `${pct}%`, height: '5px', borderRadius: '3px',
                  background: '#22c55e', transition: 'width 0.3s',
                }} />
              </div>
              <span style={{ fontSize: '10px', color: '#64748b', minWidth: '28px', textAlign: 'right' }}>
                {row.completed}/{row.total}
              </span>
            </div>
            {subStatus ? (
              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '2px 8px',
                borderRadius: '5px', whiteSpace: 'nowrap',
                color: SUB_COLOR[subStatus], background: SUB_BG[subStatus],
              }}>
                {SUB_LABEL[subStatus]}
              </span>
            ) : (
              <span style={{
                fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                borderRadius: '5px', color: '#94a3b8', background: '#f1f5f9',
              }}>
                미제출
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: typecheck 통과 확인**

```bash
bun run typecheck
```

Expected: 에러 없음

---

## Task 3: `latestSubs` + `summaryRows` memos 추가 및 JSX 연결

**Files:**
- Modify: `app/(champion)/progress/page.tsx` — `groups` memo 뒤에 2개 memo 삽입, return JSX 수정

- [ ] **Step 1: `latestSubs` useMemo 추가**

`groups` useMemo 블록 바로 뒤에 삽입한다:

```ts
// `/api/submissions/mine` 결과는 submitted_at DESC 정렬이므로 첫 번째 = 최신
const latestSubs = useMemo(() => {
  const map = new Map<number, SubmissionStatus>()
  for (const s of submissions) {
    if (!map.has(s.homework_id)) map.set(s.homework_id, s.status)
  }
  return map
}, [submissions])
```

- [ ] **Step 2: `summaryRows` useMemo 추가**

`latestSubs` memo 바로 뒤에 삽입한다:

```ts
const summaryRows = useMemo<SummaryRow[]>(() => {
  const hwLinked = published.filter(m => m.homework_id !== null)
  if (hwLinked.length === 0) return []
  const map = new Map<number, SummaryRow>()
  for (const m of hwLinked) {
    const id = m.homework_id!
    if (!map.has(id)) {
      map.set(id, {
        hwId: id,
        hwTitle: m.homeworks?.title ?? `과제 #${String(id).padStart(2, '0')}`,
        total: 0,
        completed: 0,
      })
    }
    const row = map.get(id)!
    row.total++
    if (m.status === 'completed') row.completed++
  }
  return Array.from(map.values()).sort((a, b) => a.hwId - b.hwId)
}, [published])
```

- [ ] **Step 3: JSX에 `<SummaryTable />` 삽입**

현재 JSX의 지연 배너 블록과 범례 블록 사이에 삽입한다:

```tsx
{/* 기존: 지연 배너 */}
{delayed.length > 0 && (
  <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #dc2626' }}>
    <p className="text-xs font-bold mb-1" style={{ color: '#dc2626' }}>⚠️ 지연된 마일스톤</p>
    {delayed.map(m => (
      <p key={m.id} className="text-xs" style={{ color: '#64748b' }}>• {m.title} (마감: {m.due_date})</p>
    ))}
  </div>
)}

{/* 신규: 과제 현황 요약 테이블 */}
{summaryRows.length > 0 && (
  <SummaryTable rows={summaryRows} latestSubs={latestSubs} />
)}

{/* 기존: Legend */}
<div className="flex gap-4 mb-4">
```

- [ ] **Step 4: typecheck 통과 확인**

```bash
bun run typecheck
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add app/\(champion\)/progress/page.tsx
git commit -m "[AX-1] feat: 챔피언 진척도 페이지에 과제별 요약 테이블 추가

- /api/milestones + /api/submissions/mine 병렬 fetch
- 과제별 마일스톤 완료율 + 최종 제출 상태 뱃지 표시
- 독립 WBS(homework_id 없는 마일스톤)는 요약 테이블 제외

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## 검증

- [ ] `bun run dev` 실행 후 `/progress` 접속
- [ ] 마일스톤 있는 계정으로 로그인 시 "과제 현황" 테이블이 Gantt 위에 표시되는지 확인
- [ ] 마일스톤이 없는 경우 요약 테이블이 렌더링되지 않는지 확인
- [ ] 제출 없는 과제 row → "미제출" (회색 뱃지) 표시 확인
- [ ] 제출 있는 과제 row → pending/accepted/declined 각 뱃지 색상 확인
- [ ] 지연 배너가 요약 테이블 위에 표시되는지 확인
