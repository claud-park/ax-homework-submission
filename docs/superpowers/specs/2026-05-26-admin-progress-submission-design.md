# 어드민 진척도 — 제출 상태 통합 설계

> **날짜** 2026-05-26 · **상태** 승인됨 · **담당** yr.park@dreamus.io

---

## 1. 목표

`/admin/progress` 페이지에 **제출 상태 정보**를 통합해, 어드민이 마일스톤 진행 현황과 최종 제출 상태를 한 화면에서 파악할 수 있게 한다.

현재는 마일스톤 카드와 과제정의서 카드만 표시되고, 제출(합격/검토중/불합격/미제출) 상태는 별도 칸반 페이지에서만 확인할 수 있다.

---

## 2. 스코프

### In

- 페이지 상단에 **집계 통계 바** 추가 (합격 / 검토중 / 불합격 / 미제출 / 지연 마일스톤 수)
- 챔피언별 뷰의 **과제 그룹 헤더**(`HomeworkGroup`)에 제출 상태 뱃지 추가
- 과제별 뷰의 **유저 서브섹션 헤더**(`UserSubSection`)에 제출 상태 뱃지 추가
- 통계 바는 챔피언 필터 체크 상태에 실시간 반응

### Out

- 새 API 엔드포인트 추가
- DB 변경
- 새 파일 추가
- 칸반 페이지 변경
- 챔피언 뷰의 챔피언 헤더(outer)에 뱃지 (과제 그룹 헤더만 해당)

---

## 3. 설계

### 3.1 데이터 fetching

기존 두 fetch에 세 번째를 병렬로 추가:

```ts
const [milestonesData, chartersData, kanbanData] = await Promise.all([
  apiFetch<MilestoneWithUser[]>('/api/admin/milestones'),
  apiFetch<CharterWithUser[]>('/api/admin/charters'),
  apiFetch<KanbanDataV2>('/api/admin/kanban'),
])
```

`/api/admin/kanban`은 기존 엔드포인트. `KanbanDataV2` 구조(not_started / in_progress / reviewing / accepted / declined 컬럼)를 사용.

### 3.2 submission 상태 맵 계산

kanban 응답을 `Map<"userId_hwId", SubmissionStatus | null>`로 변환:

```ts
type SubmissionStatusOrNull = SubmissionStatus | 'not_submitted'

const subStatusMap = useMemo(() => {
  const map = new Map<string, SubmissionStatusOrNull>()
  for (const card of kanbanData.accepted)   map.set(`${card.userId}_${card.homeworkId}`, 'accepted')
  for (const card of kanbanData.reviewing)  map.set(`${card.userId}_${card.homeworkId}`, 'pending')
  for (const card of kanbanData.declined)   map.set(`${card.userId}_${card.homeworkId}`, 'declined')
  for (const card of kanbanData.in_progress) map.set(`${card.userId}_${card.homeworkId}`, 'not_submitted')
  for (const card of kanbanData.not_started) map.set(`${card.userId}_${card.homeworkId}`, 'not_submitted')
  return map
}, [kanbanData])
```

### 3.3 집계 통계 바 계산

챔피언 필터(`selectedUsers`)에 반응해 클라이언트에서 계산:

```ts
const stats = useMemo(() => {
  let accepted = 0, reviewing = 0, declined = 0, not_submitted = 0, overdue = 0
  for (const [key, status] of subStatusMap) {
    const userId = key.split('_')[0]
    if (!selectedUsers.has(userId)) continue
    if (status === 'accepted') accepted++
    else if (status === 'pending') reviewing++
    else if (status === 'declined') declined++
    else not_submitted++
  }
  overdue = milestones.filter(m => selectedUsers.has(m.user_id) && isOverdue(m)).length
  return { accepted, reviewing, declined, not_submitted, overdue }
}, [subStatusMap, selectedUsers, milestones])
```

### 3.4 컴포넌트 구조

```
AdminProgressPage
  ├── StatsBar           ← NEW: 집계 통계 바
  ├── (view mode toggle)  ← 기존 유지
  ├── (champion filter chips) ← 기존 유지
  └── (content)
        챔피언별 뷰:
          ChampionSection
            └── HomeworkGroup  ← 헤더에 뱃지 추가
        과제별 뷰:
          HomeworkSection
            └── UserSubSection ← 헤더에 뱃지 추가
```

`StatsBar`는 page.tsx 내 인라인 컴포넌트로 작성 (단일 페이지 전용, 파일 분리 불필요).

### 3.5 UI 상세

#### 집계 통계 바

페이지 헤더와 view mode toggle 사이에 배치. 단일 가로 바:

| 항목 | 색상 |
|---|---|
| 합격 N | `var(--success)` (#22c55e) |
| 검토중 N | `var(--amber)` (#f59e0b) |
| 불합격 N | `var(--error)` (#f87171) |
| 미제출 N | `var(--text-disabled)` |
| 지연 마일스톤 N | `var(--error)` |

구분선(`|`)으로 섹션 분리. 지연 마일스톤은 오른쪽 끝에 구분선 후 표시.

#### 제출 상태 뱃지

`HomeworkGroup` 헤더와 `UserSubSection` 헤더에 삽입:

| 상태 | 텍스트 | 색상 |
|---|---|---|
| accepted | 합격 | `var(--success)` bg opacity 0.15 |
| pending | 검토중 | `var(--amber)` bg opacity 0.15 |
| declined | 불합격 | `var(--error)` bg opacity 0.15 |
| not_submitted | 미제출 | `var(--text-disabled)` bg opacity 0.12 |

뱃지가 없는 경우(kanban 데이터에 해당 key 없음): 렌더링하지 않음.

### 3.6 빈 상태 및 예외

- kanban fetch 실패 시: `toast.error`로 알리고 통계 바와 뱃지는 숨김 (기존 마일스톤/차터 뷰는 정상 표시)
- `homework_id = null`인 마일스톤(독립 WBS): kanban에 key가 없으므로 뱃지 미표시 (기존 동작 유지)

---

## 4. 변경 파일

| 파일 | 변경 종류 |
|---|---|
| `app/admin/progress/page.tsx` | 수정 — kanban fetch 추가, `StatsBar` 인라인 컴포넌트, `HomeworkGroup`/`UserSubSection` 헤더 뱃지 |

API 변경 없음. DB 변경 없음. 새 파일 없음.
