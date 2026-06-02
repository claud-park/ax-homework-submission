# Mobile UX Design — Champion & Admin

## Goal

Champion과 Admin 각 역할에 맞는 모바일 전용 UX를 제공한다. PC와 동일한 레이아웃이 아닌, 이동 중 빠른 액션에 최적화된 Bottom Tab Navigation + 카드 기반 레이아웃으로 전환한다.

## Architecture

- `md:` 브레이크포인트(768px)를 기준으로 사이드바 드로어(PC) ↔ Bottom Tab Bar(모바일) 분기
- 각 레이아웃(`ChampionLayout`, `AdminLayout`)에서 분기 처리
- 모바일에서 제공하지 않는 페이지는 "PC에서 이용해주세요" 안내 표시
- 새로운 컴포넌트: `BottomTabBar` (Champion/Admin 각각 별도 props)

## Tech Stack

Next.js App Router, Tailwind CSS (`md:` breakpoint), React, 기존 `apiFetch` / Supabase 그대로 활용

---

## Champion 모바일

### 네비게이션

사이드바 드로어를 모바일에서 **Bottom Tab Bar(3탭)**으로 교체.

| 탭 | 아이콘 | 경로 | 기본 랜딩 |
|---|---|---|---|
| 전체 현황 | Users | `/` | — |
| 과제정의서 | FileText | `/my-project/charter` | — |
| 내 업무 현황 | LayoutList | `/my-project/milestones` | ✓ (기본) |

- `/my-project/submission`(최종 과제 제출)은 모바일 탭에서 제외
- 현재 active 탭에 accent 색상 + 하단 dot 인디케이터

### 전체 현황 (`/`) — 모바일

기존 Gantt 차트 대신 **챔피언 카드 리스트**로 대체.

- 카드당: 아바타(이름 이니셜) + 이름 + 부서 + 마일스톤 현황 칩(완료/진행/지연 개수)
- 지연 있는 챔피언은 카드 테두리 빨간색 강조
- 검색 입력창 (이름 필터)
- 탭하면 해당 챔피언 상세 페이지(`/champions/[userId]`)로 이동 (read-only 조회)
- Gantt는 모바일에서 렌더링하지 않음

### 내 업무 현황 (`/my-project/milestones`) — 모바일

기존 리스트/테이블을 **주차별 그룹 카드**로 대체.

카드 구조:
- 상단 3px 컬러 바 (상태별: 진행 중=파랑, 지연=빨강, 완료=초록, 미시작=회색)
- 마일스톤 제목 + 마감일 + 상태 배지
- 액션 버튼 (상태에 따라 조합):
  - 미시작/진행 중: **완료** + **이슈 보고**
  - 지연 + 이슈 보고 이력 있는 경우: **완료** + **기한 변경 요청**
  - 완료: 버튼 없음(완료 배지만)
- 이슈 보고 내역 있으면 카드 안에 이탤릭 텍스트로 표시

주차 그룹 헤더: `W03 ─────── 2026-01-13 ~ 01-17`

### 과제정의서 (`/my-project/charter`) — 모바일

기존 페이지 유지, 반응형 CSS 조정만 적용 (텍스트 입력 위주라 구조 변경 불필요).

### 최종 과제 제출 — 모바일

탭에서 제외. 모바일에서 `/my-project/submission` 직접 접근 시 "PC에서 이용해주세요" 안내 표시.

---

## Admin 모바일

### 네비게이션

사이드바 드로어를 모바일에서 **Bottom Tab Bar(2탭)**으로 교체.

| 탭 | 아이콘 | 경로 | 기본 랜딩 |
|---|---|---|---|
| 지연 신고 | AlertTriangle | `/admin/delay-reports` | ✓ (기본) |
| 리포트 | FileText | `/admin/reports` | — |

- 지연 신고 탭: 미처리(답변 대기중) 건수 빨간 배지
- 칸반(`/admin/kanban`), 대시보드(`/admin`), 챔피언 리스트(`/admin/champions`), 기한 변경 요청(`/admin/requests`) 등은 모바일 탭에서 제외 → 직접 접근 시 "PC에서 이용해주세요" 안내

### 지연 신고 (`/admin/delay-reports`) — 모바일

기존 페이지 구조 유지 (카드 기반이라 이미 모바일 친화적). 레이아웃만 Bottom Tab에 맞게 조정.

- 답변 대기중 / 확인 완료 내부 탭 유지
- 각 신고 카드: 챔피언 이름 + 병목 유형 배지 + 마일스톤명 + 마감일 + 내용 + textarea 답변 + 확인 완료 버튼

### 리포트 (`/admin/reports`) — 모바일

기존 테이블을 **챔피언 카드 리스트**로 대체.

- 주차 ← → 네비게이션 유지
- 요약 바(전체/마일스톤/지연/병목 숫자) 유지
- 테이블 행 → 카드 1장: 이름 + 부서 + 과제명 + 마일스톤 현황 칩 + 병목 배지
- 인쇄/PDF 버튼 모바일에서 숨김 + "PDF 출력은 PC에서 이용해주세요" 안내

---

## 공통 구현 패턴

### Bottom Tab Bar 컴포넌트

```tsx
// components/BottomTabBar.tsx
// props: tabs[] = { icon, label, href, badge? }
// md: hidden (모바일 전용)
// active 탭: accent 색상 + 하단 dot
```

### 레이아웃 분기

```tsx
// ChampionLayout / AdminLayout 공통 패턴
// md: 이상: 기존 사이드바 유지
// md: 미만: 사이드바 숨김 + BottomTabBar 렌더링
```

### "PC에서 이용" 안내 컴포넌트

```tsx
// components/DesktopOnlyNotice.tsx
// 모바일에서 제공하지 않는 페이지에 표시
// 메시지: "이 페이지는 PC에서 이용해주세요"
// md: 이상에서는 렌더링 안 함
```

### 모바일 전용 Milestone 카드

```tsx
// 기존 CheckinTab / milestone list를 대체하는 모바일 카드
// 상태별 컬러 바 + 액션 버튼 조합은 상태에 따라 결정
```

### 모바일 전용 Champion 리스트

```tsx
// 기존 ChampionGanttView의 모바일 대체
// 챔피언별 카드 + 검색 필터
// Gantt는 md: 이상에서만 렌더링
```

---

## 스코프 외 (이번 구현 제외)

- 최종 과제 제출 모바일 UI
- Admin 챔피언 상세 모바일 최적화
- Push notification / PWA 지원
- 오프라인 지원
