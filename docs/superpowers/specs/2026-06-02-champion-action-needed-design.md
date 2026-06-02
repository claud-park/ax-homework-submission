# Champion 확인 요함 표기 디자인

## 목적

어드민과 챔피언이 전체 현황 뷰에서 두 가지 케이스를 즉시 파악할 수 있도록 시각적 표기를 추가한다.

- **Case 1**: `[charter]`를 submit하지 않은 챔피언
- **Case 2**: `[charter]`를 submit했으나 milestone을 제공하지 않은 챔피언

## 변경 범위

- `components/ChampionSummaryTable.tsx` — 인라인 배지
- `components/ChampionGanttView.tsx` — "확인 요함" 섹션 + 필터 렌더링 분리
- `app/api/champions/gantt/route.ts` — API 필터 제거

## Case 판단 기준

### Case 1 — charter 미제출
```
charterSubmissionId === null
```

### Case 2 — charter 제출, 마일스톤 미등록
```
charterSubmissionId !== null && Object.keys(weeklyStatus).length === 0
```
gantt 뷰에서는 `milestones.length === 0`으로 판단 (gantt API 데이터 기준).

## ChampionSummaryTable 변경

과제정의서 셀에 세 가지 상태를 표현한다.

| 상태 | UI |
|------|----|
| charter 없음 (Case 1) | amber `⚠️ 미제출` 배지 |
| charter 있음, 마일스톤 없음 (Case 2) | 기존 charter 배지 유지 + amber `마일스톤 없음` 서브텍스트 |
| charter + 마일스톤 모두 있음 | 기존 동작 유지 |

### 스타일 값
- 배지 background: `rgba(217,119,6,0.1)` (amber-10)
- 배지 color: `var(--amber)`
- 서브텍스트: `font-size: 10px`, 같은 amber 색상

## ChampionGanttView 변경

### API 변경
`app/api/champions/gantt/route.ts`에서 마지막 `.filter(c => c.milestones.length > 0)` 제거. 전체 챔피언을 반환하되, 간트 차트 렌더링(`toTasks`)은 기존대로 마일스톤 없는 챔피언을 건너뜀.

### "확인 요함" 섹션
- **위치**: 필터 칩 위 (컴포넌트 상단)
- **조건**: Case 1 또는 Case 2에 해당하는 챔피언이 1명 이상일 때만 표시
- **레이아웃**: 가로 방향, 두 그룹을 나란히 배치

```
┌─────────────────────────────────────────────────────┐
│  확인 요함                                           │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │ 과제정의서 미제출     │  │ 마일스톤 미등록       │ │
│  │ 홍길동, 김철수       │  │ 이영희               │ │
│  └──────────────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

- 헤더: `확인 요함` (12px, amber)
- 각 그룹 카드: amber border, 그룹 제목 + 챔피언 이름 목록
- 해당 그룹 챔피언이 0명이면 그 카드 숨김 (두 그룹 모두 0명이면 섹션 전체 숨김)

### 필터 칩
필터 칩은 간트에 표시되는 챔피언(마일스톤 있는 챔피언)만 렌더링. "확인 요함" 섹션과 중복 없이 역할 분리.

## 데이터 흐름

```
/api/champions/gantt  (수정: filter 제거)
        ↓
ChampionGanttView
  ├─ "확인 요함" 섹션: champions.filter(no charter or no milestone)
  ├─ 필터 칩: champions.filter(has milestones)
  └─ toTasks(): 기존 로직 그대로 (milestones.length === 0 시 skip)

/api/champions  (변경 없음)
        ↓
ChampionSummaryTable
  └─ 과제정의서 셀: charterSubmissionId + weeklyStatus로 케이스 판단
```

## 변경하지 않는 것

- `/api/champions` 엔드포인트 — 변경 없음
- Admin champion 상세 페이지 (`/admin/champions/[userId]`) — 변경 없음
- 칸반 페이지 — 변경 없음
- gantt 차트 내부 렌더링 로직 (`toTasks`) — 변경 없음
