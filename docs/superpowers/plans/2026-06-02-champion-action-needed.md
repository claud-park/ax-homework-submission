# Champion 확인 요함 표기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민 대시보드와 챔피언 전체 현황 뷰에서 charter 미제출 챔피언과 마일스톤 미등록 챔피언을 시각적으로 표기한다.

**Architecture:** gantt API 필터를 제거해 전체 챔피언을 반환하고, ChampionGanttView 상단에 "확인 요함" 섹션을 추가한다. ChampionSummaryTable의 과제정의서 셀에는 인라인 amber 배지를 추가한다.

**Tech Stack:** Next.js App Router, React, TypeScript, inline styles (CSS variables)

---

## File Map

| 파일 | 변경 유형 | 역할 |
|------|-----------|------|
| `app/api/champions/gantt/route.ts` | Modify | 마지막 `.filter()` 제거 → 전체 챔피언 반환 |
| `components/ChampionSummaryTable.tsx` | Modify | 과제정의서 셀에 Case 1/2 배지 추가 |
| `components/ChampionGanttView.tsx` | Modify | "확인 요함" 섹션 추가, 필터 칩은 마일스톤 있는 챔피언만 표시 |

---

## Task 1: Gantt API — 전체 챔피언 반환

**Files:**
- Modify: `app/api/champions/gantt/route.ts:82`

### 배경
현재 gantt API 응답 마지막에 `.filter(c => c.milestones.length > 0)`가 있어 마일스톤이 없는 챔피언(Case 1, Case 2)이 제외된다. ChampionGanttView에서 "확인 요함" 섹션을 렌더링하려면 이 챔피언들의 데이터가 필요하다.

간트 차트 렌더링(`toTasks`)은 이미 내부에서 `if (c.milestones.length === 0) continue`로 처리하므로 API 필터 제거가 차트 동작에 영향을 주지 않는다.

- [ ] **Step 1: API 필터 제거**

`app/api/champions/gantt/route.ts` 69~84번째 줄을 아래로 교체한다.

```typescript
  const result: GanttChampion[] = (users ?? [])
    .map(u => {
      const { displayName, department } = parseName(u.name)
      const charter = charterMap.get(u.id)
      return {
        userId: u.id,
        name: displayName,
        department,
        projectName: charter?.project_name ?? null,
        charterSubmissionId: charter?.id ?? null,
        milestones: msMap.get(u.id) ?? [],
      }
    })

  return NextResponse.json(result)
```

`.filter(c => c.milestones.length > 0)` 줄이 제거된 것이 핵심이다.

- [ ] **Step 2: 동작 확인**

개발 서버가 실행 중이라면 `curl http://localhost:3000/api/champions/gantt` (또는 브라우저 Network 탭)로 응답을 확인한다. 마일스톤이 없는 사용자도 `milestones: []`로 포함되어야 한다.

- [ ] **Step 3: Commit**

```bash
git add app/api/champions/gantt/route.ts
git commit -m "[AX-1] fix(api): gantt 엔드포인트에서 전체 챔피언 반환 (마일스톤 필터 제거)"
```

---

## Task 2: ChampionSummaryTable — 과제정의서 셀 배지 추가

**Files:**
- Modify: `components/ChampionSummaryTable.tsx:89-108`

### 배경
현재 과제정의서 셀 로직:
- `charterSubmissionId`가 있으면 → charter 상태 배지 (게시됨/초안)
- 없으면 → `—`

Case 1 (charter 없음)과 Case 2 (charter 있음, 마일스톤 없음)를 구분해서 표시해야 한다.

Case 2 판단: `charterSubmissionId !== null && Object.keys(weeklyStatus).length === 0`

### 스타일 상수 (파일 상단에 추가)

```typescript
const AMBER_BADGE = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 4,
  background: 'rgba(217,119,6,0.1)',
  color: 'var(--amber)',
} as const
```

- [ ] **Step 1: `AMBER_BADGE` 상수를 파일 상단에 추가**

`components/ChampionSummaryTable.tsx`의 `STATUS_ICON` 상수 선언 바로 아래에 추가한다.

```typescript
const AMBER_BADGE: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 4,
  background: 'rgba(217,119,6,0.1)',
  color: 'var(--amber)',
  display: 'inline-block',
}
```

- [ ] **Step 2: 과제정의서 셀 교체**

`components/ChampionSummaryTable.tsx`의 `<td style={{ padding: '10px 12px' }}>` (과제정의서 셀, 약 89번째 줄) 전체를 아래로 교체한다.

```tsx
<td style={{ padding: '10px 12px' }}>
  {c.charterSubmissionId ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <button
        onClick={() => onCharterClick(c.userId)}
        style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 4,
          border: 'none',
          cursor: 'pointer',
          background: c.charterStatus === 'published' ? 'rgba(37,99,235,0.1)' : 'rgba(100,116,139,0.1)',
          color: c.charterStatus === 'published' ? 'var(--blue-600)' : 'var(--text-secondary)',
          alignSelf: 'flex-start',
        }}
      >
        {c.charterStatus === 'published' ? '📋 게시됨' : '📝 초안'}
      </button>
      {Object.keys(c.weeklyStatus).length === 0 && (
        <span style={{ ...AMBER_BADGE, alignSelf: 'flex-start' }}>
          마일스톤 없음
        </span>
      )}
    </div>
  ) : (
    <span style={AMBER_BADGE}>⚠️ 미제출</span>
  )}
</td>
```

- [ ] **Step 3: 브라우저에서 `/admin` 표 뷰 확인**

- charter가 없는 챔피언 행의 과제정의서 셀: amber `⚠️ 미제출` 표시
- charter가 있으나 마일스톤 없는 챔피언 행: 기존 charter 배지 아래에 amber `마일스톤 없음` 서브텍스트
- charter + 마일스톤 모두 있는 챔피언 행: 기존과 동일

- [ ] **Step 4: Commit**

```bash
git add components/ChampionSummaryTable.tsx
git commit -m "[AX-1] feat(admin): 챔피언 현황 표에 charter/마일스톤 미등록 배지 추가"
```

---

## Task 3: ChampionGanttView — "확인 요함" 섹션 추가

**Files:**
- Modify: `components/ChampionGanttView.tsx`

### 배경
ChampionGanttView는 `/admin` 간트 뷰와 `/(champion)` 전체 현황 페이지 양쪽에서 사용된다.

Task 1에서 API 필터를 제거했으므로 `champions` 배열에 마일스톤 없는 챔피언도 포함된다. 이 챔피언들을 "확인 요함" 섹션으로 표시하고, 기존 필터 칩과 gantt는 마일스톤 있는 챔피언만 대상으로 유지한다.

### 케이스 분류 로직

```typescript
const noCharter = champions.filter(c => !c.charterSubmissionId)
const noMilestone = champions.filter(c => c.charterSubmissionId && c.milestones.length === 0)
const hasMilestones = champions.filter(c => c.milestones.length > 0)
```

### "확인 요함" 섹션 UI

```tsx
{(noCharter.length > 0 || noMilestone.length > 0) && (
  <div style={{
    marginBottom: 16,
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid rgba(217,119,6,0.3)',
    background: 'rgba(217,119,6,0.04)',
  }}>
    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', marginBottom: 8 }}>
      확인 요함
    </p>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {noCharter.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            과제정의서 미제출
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-primary)' }}>
            {noCharter.map(c => c.name).join(', ')}
          </p>
        </div>
      )}
      {noMilestone.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            마일스톤 미등록
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-primary)' }}>
            {noMilestone.map(c => c.name).join(', ')}
          </p>
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 1: `ChampionGanttView` 컴포넌트 내 분류 상수 추가**

`ChampionGanttView` 함수 내부, `filteredChampions` useMemo 바로 위에 아래 세 개의 useMemo를 추가한다.

```typescript
const noCharter = useMemo(
  () => champions.filter(c => !c.charterSubmissionId),
  [champions],
)
const noMilestone = useMemo(
  () => champions.filter(c => !!c.charterSubmissionId && c.milestones.length === 0),
  [champions],
)
const championsWithMilestones = useMemo(
  () => champions.filter(c => c.milestones.length > 0),
  [champions],
)
```

- [ ] **Step 2: `filteredChampions` 소스를 `championsWithMilestones`로 변경**

기존:
```typescript
const filteredChampions = useMemo(
  () => champions.filter(c => selectedChampions.has(c.userId)),
  [champions, selectedChampions],
)
```

변경 후:
```typescript
const filteredChampions = useMemo(
  () => championsWithMilestones.filter(c => selectedChampions.has(c.userId)),
  [championsWithMilestones, selectedChampions],
)
```

- [ ] **Step 3: `setSelectedChampions` 초기화를 `championsWithMilestones` 기준으로 변경**

`useEffect` 내 `setChampions` 직후 `setSelectedChampions` 호출 부분:

기존:
```typescript
setSelectedChampions(new Set(data.map(c => c.userId)))
```

변경 후:
```typescript
setSelectedChampions(new Set(data.filter(c => c.milestones.length > 0).map(c => c.userId)))
```

- [ ] **Step 4: 필터 칩 반복 소스를 `championsWithMilestones`로 변경**

기존:
```tsx
{champions.map(c => {
```

변경 후:
```tsx
{championsWithMilestones.map(c => {
```

- [ ] **Step 5: "확인 요함" 섹션을 렌더 JSX에 추가**

`return` 블록의 `<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>` 바로 안쪽, `{/* Champion filter chips */}` 주석 위에 아래 섹션을 삽입한다.

```tsx
{(noCharter.length > 0 || noMilestone.length > 0) && (
  <div style={{
    marginBottom: 16,
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid rgba(217,119,6,0.3)',
    background: 'rgba(217,119,6,0.04)',
  }}>
    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', marginBottom: 8 }}>
      확인 요함
    </p>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {noCharter.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            과제정의서 미제출
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-primary)' }}>
            {noCharter.map(c => c.name).join(', ')}
          </p>
        </div>
      )}
      {noMilestone.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            마일스톤 미등록
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-primary)' }}>
            {noMilestone.map(c => c.name).join(', ')}
          </p>
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 6: 브라우저에서 확인**

`/admin` 간트 뷰:
- 상단에 "확인 요함" 섹션이 보임 (해당 챔피언이 있을 때)
- 필터 칩에는 마일스톤이 있는 챔피언만 표시
- 간트 차트 동작 기존과 동일

`/` (챔피언 전체 현황) 페이지:
- 동일한 "확인 요함" 섹션이 보임

해당 케이스 챔피언이 없으면 섹션이 렌더링되지 않음.

- [ ] **Step 7: Commit**

```bash
git add components/ChampionGanttView.tsx
git commit -m "[AX-1] feat(admin): 간트 뷰에 확인 요함 섹션 추가 (charter/마일스톤 미등록 챔피언 표시)"
```
