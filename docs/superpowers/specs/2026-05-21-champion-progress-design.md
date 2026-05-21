# 챔피언 진척도 페이지 (`/progress`) 완성 설계

> **날짜** 2026-05-21 · **상태** 승인됨 · **담당** yr.park@dreamus.io

---

## 1. 목표

챔피언이 `/progress` 페이지에서 자신의 **과제별 진행 현황**을 한눈에 파악할 수 있도록, 기존 Gantt 테이블 위에 **요약 테이블 섹션**을 추가한다.

현재는 마일스톤 Gantt만 표시되어, 챔피언이 최종 제출 상태(합격 여부)를 이 페이지에서 확인할 수 없다.

---

## 2. 스코프

### In

- `/progress` 페이지 상단에 **과제별 요약 테이블** 추가
- 요약 테이블: 과제명 / 마일스톤 완료율(X/Y + 진행률 바) / 최종 제출 상태 뱃지
- `/api/submissions/mine` 병렬 fetch 추가 (기존 API, 서버 변경 없음)
- 제출 상태 뱃지: 미제출 / 검토중 / 합격 / 불합격

### Out

- 어드민 `/admin/progress` 페이지 (다음 세션)
- 주간 리포트 `/admin/reports/[week]` (다음 세션)
- Gantt 테이블 자체 변경
- Charter 제출 상태 (이번 스코프에서 제외)
- 새 API 엔드포인트 추가

---

## 3. 설계

### 3.1 데이터 fetching

```ts
// Promise.all 병렬 fetch
const [milestones, submissions] = await Promise.all([
  apiFetch<MilestoneWithHomework[]>('/api/milestones'),
  apiFetch<Submission[]>('/api/submissions/mine'),
])
```

- `milestones` — 이미 fetch 중 (변경 없음). `homework_id`, `status`, `publish_status` 포함
- `submissions` — `/api/submissions/mine` 신규 fetch. `homework_id`, `status(pending|accepted|declined)`, `attempt_number` 포함
- 조인 기준: `homework_id`
- submissions 중 같은 homework_id에 여러 건이 있으면 `attempt_number` 기준 최신 1건 사용

### 3.2 요약 테이블 계산 로직

과제별로 다음을 계산한다:

| 항목 | 계산 |
|---|---|
| 과제 목록 | `milestones`에 존재하는 고유 `homework_id` (published만) |
| 전체 마일스톤 수 | 해당 `homework_id`의 `publish_status === 'published'` 마일스톤 수 |
| 완료 마일스톤 수 | 위 중 `status === 'completed'` 수 |
| 최종 제출 상태 | 해당 `homework_id`의 최신 submission `status` (없으면 `null`) |

### 3.3 컴포넌트 구조

```
ProgressPage
  ├── SummaryTable          ← NEW: 요약 테이블
  │     └── SummaryRow × N  ← 과제당 1행
  ├── (지연 배너)           ← 기존 유지
  ├── (범례)               ← 기존 유지
  └── (Gantt 테이블)        ← 기존 유지, 변경 없음
```

`SummaryTable`은 `page.tsx` 내 인라인 컴포넌트로 작성 (파일 분리 불필요, 단일 페이지 전용).

### 3.4 UI 상세

**테이블 헤더**: `과제` / `마일스톤 진행률` / `최종 제출`

**각 행**:
- 과제명 (bold) + 부제: `과제 #XX · 마감 YYYY-MM-DD`
- 진행률: `[progress bar] X/Y`
  - 완료율 0% → 회색 바, >0% → 초록 바
- 최종 제출 뱃지:

| 상태 | 텍스트 | 색상 |
|---|---|---|
| 없음 | 미제출 | 회색 (`var(--text-disabled)` bg) |
| pending | 검토중 | 노란색 (`var(--amber)`) |
| accepted | 합격 | 초록 (`var(--success)`) |
| declined | 불합격 | 빨간 (`var(--error)`) |

**배치 순서** (위→아래):
1. 페이지 헤더 (타이틀 + 오늘 날짜)
2. 지연 배너 (지연 마일스톤 있을 때만) ← 맨 위로 이동
3. **요약 테이블** ← 추가
4. 범례
5. Gantt 테이블

### 3.5 빈 상태

- 마일스톤이 하나도 없으면 요약 테이블을 렌더링하지 않음 (기존 Gantt 빈 상태 메시지만 표시)

---

## 4. 변경 파일

| 파일 | 변경 종류 |
|---|---|
| `app/(champion)/progress/page.tsx` | 수정 — `SummaryTable` 추가, submissions fetch 추가 |

API 변경 없음. DB 변경 없음. 새 파일 없음.
