# 디시인사이드 과제 관리 플랫폼 — 제품 요구사항 명세서 (PRD)

> **문서 버전** 2.0 · **최종 업데이트** 2026-06-02 · **작성자** yr.park@dreamus.io
> **상태** 사내 검토 중 · **저장소** `AX/ax-homework-submission`
> **이전 버전** v1.2 (2026-05-27)

---

## 문서 정보

| 항목 | 내용 |
|---|---|
| 프로젝트명 | 디시인사이드 과제 관리 플랫폼 (ax-homework-submission) |
| 버전 | v2.0 |
| 작성일 | 2026-06-02 |
| 작성자 | yr.park@dreamus.io |
| 검토자 | Strategy Lead · Engineering Lead |

---

## 0. 개요 (Executive Summary)

### 한 줄 요약
**AX 프로그램의 과제 정의 → 수행 → 검토 → 피드백을 단일 플랫폼에서 처리하는 풀스택 웹 애플리케이션.**

### 도입 배경
AX 프로그램은 다수의 챔피언(수강생)이 멀티-마일스톤 과제를 수행하는 구조이나, 현재 제출·검토 워크플로우가 이메일·스프레드시트·Slack에 분산되어 있어 관리 비용이 지속 누적되고 있다. 본 플랫폼은 **과제정의서(Charter) → WBS 마일스톤 → 산출물 제출 → 합격 판정** 의 전 라이프사이클을 단일 시스템에 통합한다.

### 핵심 차별점

| 항목 | 기존 운영 방식 | 본 플랫폼 |
|---|---|---|
| Charter 작성 | Word 파일 첨부 | TipTap WYSIWYG + DOCX 내보내기 |
| 진행 현황 파악 | 스프레드시트 수동 갱신 | Gantt + 챔피언 전체 현황 자동 연동 |
| 검토 워크플로우 | 이메일 회람 | 단방향 DnD 칸반 (검토중 → 합격/불합격) |
| 피드백 루프 | Slack·대면 | 양방향 댓글 + 이메일 자동 알림 (9 트리거) |
| 어드민 액션 | 수동 연락 | 대시보드 내 Nudge 원클릭 이메일 발송 |
| 임시저장 | 없음 | 초안(Draft) / 게시(Publish) 이원화 |
| 데이터 보안 | 공용 파일 서버 | Supabase RLS DENY ALL + 서버 단일 게이트웨이 |
| 배포 | 수동 | GitHub Actions CI + Docker + Jenkins 자동화 |
| 모바일 접근 | 불가 (데스크톱 전용) | 챔피언·어드민 주요 페이지 모바일 최적화 |

### 현재 진척도 (2026-06-02 기준)

| 영역 | 상태 |
|---|---|
| 인증 (Google OAuth) | ✅ 완료 |
| 과제 관리 (Admin CRUD + 임시저장) | ✅ 완료 |
| Charter 작성·제출·댓글 | ✅ 완료 |
| Milestone / WBS + 2-depth 트리 + Gantt | ✅ 완료 |
| 마일스톤 기한 변경 모달 (start_date 경과 미시작 케이스) | ✅ 완료 |
| 파일 제출 + 칸반 판정 | ✅ 완료 |
| 이메일 알림 (9 트리거) | ✅ 완료 |
| 기한변경 요청 | ✅ 완료 |
| 임시저장 (Draft/Publish) | ✅ 완료 |
| CI/CD (GitHub Actions + Docker) | ✅ 완료 |
| 주간 체크인 + 지연 신고 검토 | ✅ 완료 |
| 어드민 챔피언 전체 현황 (Gantt + 요약 테이블) | ✅ 완료 |
| 확인 요함 섹션 (charter·마일스톤 미등록 표기) | ✅ 완료 |
| Champion Nudge (원클릭 이메일 넛지) | ✅ 완료 |
| 주간 리포트 (PDF 인쇄·주차 네비게이션) | ✅ 완료 |
| 모바일 UX (챔피언·어드민 주요 페이지) | ✅ 완료 |
| 챔피언 진행 대시보드 (`/progress`) | 🚧 골격만 |

**전체 기능 완성도**: 핵심 17개 영역 중 16개 완료 (**94%**)

---

## 1. 문제 정의 및 기회

### 1.1 현재의 페인 포인트

AX 프로그램 운영 시 4개의 정보 흐름이 각기 다른 채널에서 관리된다.

1. **과제 정의** — 어드민이 챔피언에게 과제 부여 (이메일)
2. **과제정의서(Charter)** — 챔피언이 문제 정의·목표·범위 명확화 (Word 파일)
3. **마일스톤(WBS)** — 주차별 작업 계획 및 산출물 누적 (스프레드시트)
4. **최종 제출 및 판정** — 어드민의 합격/불합격 결정 (이메일)

이로 인한 운영 비용:

| 페인 포인트 | 영향 |
|---|---|
| 단일 진실 부재 (No SSOT) | Charter는 Word, 진행도는 Sheet, 제출은 메일로 분산 |
| 상태 가시화 부재 | 어느 챔피언이 어디서 막혀 있는지 파악 불가 |
| 피드백 사일로 | 댓글이 메일 스레드에 흩어져 컨텍스트 유실 |
| 승인 워크플로우 비표준 | 기한변경 요청이 비공식 채널로 처리 |
| 미등록 챔피언 추적 불가 | charter·마일스톤 미등록 챔피언을 수동으로 파악 |

### 1.2 기회

- AX 프로그램 **확장 (더 많은 챔피언 수용)** 을 위한 표준화된 워크플로우 도구 필요
- 향후 **타 교육·육성 프로그램으로 재사용** 가능한 화이트라벨 베이스라인
- 데이터 축적 후 **챔피언 성과 분석·코칭 인사이트** 도출 가능

---

## 2. 대상 사용자

### 2.1 페르소나 A — 챔피언 (수강생)

| 항목 | 내용 |
|---|---|
| 목표 | 부여된 과제를 명확히 이해하고, 계획대로 수행하여 합격 |
| 불편함 | 과제 요구사항 불명확 / 산출물 형식 혼란 / 피드백 지연 |
| 주요 행동 | Charter 작성 → Milestone 등록 → 주간 체크인 → 기한변경 요청 → 최종 제출 |

### 2.2 페르소나 B — 어드민 (운영자·심사자)

| 항목 | 내용 |
|---|---|
| 목표 | 다수 챔피언의 진행상황 파악 및 신속한 판정·피드백 |
| 불편함 | 비동기 제출물 트래킹 / 미등록 챔피언 수동 파악 / 피드백 전달 오버헤드 |
| 주요 행동 | 전체 현황 확인 → Nudge 발송 → Charter 리뷰 → 칸반 판정 → 기한변경 승인 |

### 2.3 권한 모델

```
챔피언 : user_metadata.is_admin = false  (기본값)
어드민  : user_metadata.is_admin = true
```

- 모든 API는 JWT 검증 (`verifyJWT`) + 어드민 전용 API는 추가 검증 (`verifyAdmin`)
- 클라이언트의 직접 DB 접근 금지 (Supabase RLS **DENY ALL**)

---

## 3. 솔루션 개요

### 3.1 시스템 컨텍스트

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser (CSR)                                                       │
│  챔피언 UI: /my-project/charter, /my-project/milestones, /progress   │
│  어드민 UI: /admin, /admin/delay-reports, /admin/reports             │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ HTTPS + JWT
┌──────────────────────▼───────────────────────────────────────────────┐
│  Next.js 14 App Router                                               │
│  middleware.ts (역할 기반 라우팅) + API Routes (app/api/**)          │
└────────┬────────────────────────────────────────┬────────────────────┘
         │ service_role key                        │ SMTP
┌────────▼──────────────────────────────┐  ┌──────▼────────────┐
│  Supabase (RLS DENY ALL)              │  │  Gmail SMTP       │
│  Auth (Google OAuth)                  │  │  (Nodemailer)     │
│  PostgreSQL (9개 핵심 테이블)         │  │  9 트리거         │
│  Storage (submissions 버킷)           │  └───────────────────┘
└───────────────────────────────────────┘
```

### 3.2 4계층 아키텍처

| 레이어 | 기술 | 역할 |
|---|---|---|
| 표현(Presentation) | React 18 + shadcn/ui + Tailwind CSS + FLO Design System | 화면 구성·인터랙션 |
| 라우팅/인증 | Next.js 14 App Router + middleware.ts | 역할 기반 라우팅·접근 제어 |
| 비즈니스 로직 | Next.js API Routes (Node.js 런타임) | 권한 검증·비즈니스 규칙 |
| 데이터 | Supabase Auth + PostgreSQL + Storage | 영속성·인증 |

---

## 4. 핵심 기능 명세

### 4.1 챔피언 기능

| # | 기능 | 구현 기술 | 상태 |
|---|---|---|---|
| C1 | Google OAuth 로그인 | Supabase Auth | ✅ |
| C2 | 과제 목록 (List 뷰) | Next.js | ✅ |
| C3 | Charter(과제정의서) 작성·저장·제출 | TipTap WYSIWYG, 6-section | ✅ |
| C4 | Charter DOCX 내보내기 | `docx` 라이브러리 | ✅ |
| C5 | Charter 초안 저장 / 게시 | publish_status enum | ✅ |
| C6 | Milestone(WBS) CRUD — 2-depth 트리 | 자동 상태 계산 엔진 | ✅ |
| C7 | Milestone Gantt 시각화 | `gantt-task-react` | ✅ |
| C8 | Milestone 초안 저장 / 게시 | publish_status enum | ✅ |
| C9 | 기한변경 요청 | `deadline_change_requests` | ✅ |
| C10 | 댓글 작성·답글 (양방향 알림) | charter_comments | ✅ |
| C11 | 주간 체크인 (4가지 액션) | checkin 상태 워크플로우 | ✅ |
| C12 | 마일스톤 기한 변경 모달 | start_date 경과 미시작 케이스 | ✅ |
| C13 | 모바일 UX (BottomTabBar + 카드 레이아웃) | 반응형 컴포넌트 | ✅ |
| C14 | 챔피언 진행 대시보드 | `/progress` | 🚧 골격 |

#### Charter 6 섹션 구조

| 섹션 | 설명 | 필수 여부 |
|---|---|---|
| 문제 정의 (AS-IS) | 현재 상황·문제점 기술 | ⭐ 필수 |
| 목표 (TO-BE) | 달성하고자 하는 목표 상태 | ⭐ 필수 |
| 범위 In (Scope In) | 이번 과제에 포함되는 내용 | ⭐ 필수 |
| 범위 Out (Scope Out) | 이번 과제에서 제외되는 내용 | ⭐ 필수 |
| 기대 효과 | 과제 완료 시 예상 효과 | 선택 |
| 리스크 | 수행 중 예상 위험 요소 | 선택 |

#### 주간 체크인 4가지 액션

| 액션 | 상태 | 설명 |
|---|---|---|
| 완료 처리 | `completed` | 마일스톤 완료 수동 지정 |
| 지연 신고 | `delayed` | bottleneck 유형·내용 기재 |
| 기한 연장 | — | 새 due_date 요청 |
| 진행 중 | `in_progress` | 진행 중임을 수동 표시 |

#### Milestone 2-depth 트리 구조

```
depth-0 (parent_milestone_id IS NULL)  → 과제 그룹 (날짜 선택적)
  └── depth-1 (parent_milestone_id IS NOT NULL)  → 실제 마일스톤 (날짜 필수)
```

- depth-0 그룹은 Gantt에서 토글 가능한 project 행으로 표시
- depth-1 마일스톤에 상태 계산, 체크인, 기한 변경 적용

#### 마일스톤 기한 변경 모달 케이스

| 케이스 | 조건 | 입력 필드 |
|---|---|---|
| 일반 기한 변경 | start_date 미경과 또는 in_progress | end_date만 입력 |
| start+end 동시 변경 | `start_date < today` AND `status = 'not_started'` | start_date + end_date 두 개 |

### 4.2 어드민 기능

| # | 기능 | 구현 기술 | 상태 |
|---|---|---|---|
| A1 | 과제 생성·편집 (초안/게시 포함) | TipTap (description) | ✅ |
| A2 | 칸반 보드 (단방향 DnD 판정) | dnd-kit + 낙관적 업데이트 | ✅ |
| A3 | 제출 상세 사이드 패널 | Sheet UI (리사이저블) | ✅ |
| A4 | Charter 리뷰 및 댓글 | 양방향 알림 | ✅ |
| A5 | 기한변경 요청 승인·거절 | 자동 마감일 갱신 | ✅ |
| A6 | 이메일 알림 (9 트리거) | Nodemailer + Gmail SMTP | ✅ |
| A7 | 지연 신고 검토 및 답변 | `/admin/delay-reports` | ✅ |
| A8 | 챔피언 전체 현황 대시보드 | ChampionSummaryTable + ChampionGanttView | ✅ |
| A9 | 확인 요함 섹션 (charter·마일스톤 미등록 표기) | amber 배지 + Gantt 상단 섹션 | ✅ |
| A10 | Champion Nudge (원클릭 이메일 넛지) | NudgePopover + POST /api/admin/nudge | ✅ |
| A11 | 주간 리포트 (PDF 인쇄·주차 네비게이션) | @media print + 주차별 필터 | ✅ |
| A12 | 어드민 모바일 UX (BottomTabBar + 카드 레이아웃) | 반응형 컴포넌트 | ✅ |

#### 칸반 5-컬럼 구조 (단방향)

```
미시작 → 진행중 → 검토중 ──DnD──→ 합격
                          ╰──────→ 불합격
                     (단방향: 합격·불합격 후 되돌릴 수 없음)
```

#### 챔피언 전체 현황 구성

| 컴포넌트 | 역할 |
|---|---|
| `ChampionSummaryTable` | 챔피언별 charter 제출 상태, 마일스톤 등록 여부, 주차별 진행도 표 |
| `ChampionGanttView` | 전체 챔피언 Gantt (간트만 표시, 뷰 토글 없음) |
| 확인 요함 섹션 | Gantt 상단 — charter 미제출 / 마일스톤 미등록 챔피언 amber 카드, fold/unfold |

#### Champion Nudge 트리거 2가지

| 트리거 | 위치 | Nudge 타입 |
|---|---|---|
| 확인 요함 칩 클릭 | 과제정의서 미제출 섹션 | `no_charter` |
| 확인 요함 칩 클릭 | 마일스톤 미등록 섹션 | `no_milestone` |
| Gantt delayed 바 클릭 | 간트 차트 | `delayed_milestone` |

#### Nudge 이메일 타입 (3종)

| 타입 | Subject | CTA |
|---|---|---|
| `no_charter` | `[AX] 과제정의서 제출을 기다리고 있습니다 🙏` | 과제정의서 작성하기 |
| `no_milestone` | `[AX] 마일스톤 등록을 기다리고 있습니다 🙏` | 마일스톤 등록하기 |
| `delayed_milestone` | `[AX] '{{title}}' 마일스톤을 확인해주세요 🙏` | 마일스톤 확인하기 |

### 4.3 이메일 알림 매트릭스 (9 트리거)

| # | 트리거 이벤트 | 발신 대상 | 함수 |
|---|---|---|---|
| E1 | 챔피언이 최종 제출 | 어드민 | `notifyNewSubmission` |
| E2 | 챔피언이 기한변경 요청 | 어드민 | `notifyDeadlineChangeRequest` |
| E3 | 챔피언이 제출물에 댓글 | 어드민 | `notifyNewComment` |
| E4 | 어드민이 제출물에 댓글 | 챔피언 | `notifyNewComment` |
| E5 | 챔피언이 Charter에 댓글 | 어드민 | `notifyNewComment` |
| E6 | 어드민이 Charter에 답글 | 챔피언 | `notifyNewComment` |
| E7 | 챔피언이 지연 신고 제출 | 어드민 | `notifyBottleneck` |
| E8 | 어드민이 지연신고 이메일 링크 → delay-reports 이동 | — | 링크 수정 완료 |
| E9 | 어드민이 Nudge 발송 (3 타입) | 챔피언 | `nudgeChampion` |

### 4.4 임시저장 (Drafting) 기능 상세

`publish_status` 열(`draft` | `published`)을 `homeworks`, `charter_submissions`, `milestones` 세 테이블에 적용.

| 동작 | 설명 |
|---|---|
| 초안 저장 | 어드민이 과제를, 챔피언이 Charter·Milestone을 비공개로 저장 |
| 게시 | 단일 버튼으로 `publish_status = 'published'`로 전환 |
| 초안 필터링 | 칸반·진행도에서 초안 항목 자동 제외 |
| 초안 전파 차단 | 초안 과제에 대한 Charter 제출·Milestone 등록 차단 |
| 부분 인덱스 | 초안 전용 partial index 3개로 조회 성능 최적화 |

---

## 5. 사용자 플로우

### 5.1 챔피언 End-to-End 여정

```
[진입] → 로그인(Google OAuth) → 과제 목록 확인
  ↓
Charter 작성 (6 섹션) → 초안 저장 또는 게시
  ↓
WBS 마일스톤 등록 (depth-0 그룹 → depth-1 마일스톤) → Gantt 시각화
  ↓
과제 수행 중...
  ├─ 주간 체크인: 완료·지연 신고·기한 연장·진행 중 중 선택
  ├─ start_date 경과 미시작 시 → start+end 동시 기한 변경 모달
  └─ 기한 부족 시 → 기한변경 요청 → (E2 어드민 알림)
  ↓
최종 제출 → (E1 어드민 알림) → 상태: 검토중
  ↓
어드민 칸반 DnD → 합격 or 불합격
  └─ 불합격 시 댓글 피드백 → (E4 챔피언 알림) → 재제출
```

### 5.2 어드민 검토 플로우

```
[매일 아침]
  /admin 대시보드 접속 → ChampionGanttView + 확인 요함 섹션 확인
  ├─ 확인 요함 칩 클릭 → NudgePopover → 찌르기 📧 → E9 챔피언 이메일
  └─ Gantt delayed 바 클릭 → NudgePopover → 찌르기 📧 → E9 챔피언 이메일
  ↓
/admin/delay-reports → 지연 신고 텍스트 답변 + 확인 완료 처리
  ↓
/admin/reports → 주간 리포트 확인 (주차 네비게이션) → PDF 인쇄
  ↓
/admin/kanban → 검토중 카드 DnD → 합격/불합격
```

### 5.3 Charter 양방향 댓글 루프

```
챔피언 Charter 게시
  → 어드민 댓글 → (E5 챔피언 이메일)
  → 챔피언 답글 → (E6 어드민 이메일)
  → ... (최대 depth 2)
  → 어드민 is_resolved = true 로 종결
```

### 5.4 보안 게이트웨이

```
브라우저 ──X──→ Supabase DB (직접 접근 차단: RLS DENY ALL)
브라우저 ──O──→ Next.js API Routes (verifyJWT + verifyAdmin)
                         ↓ service_role key
                    Supabase DB / Storage
```

---

## 6. 데이터 모델

### 6.1 핵심 테이블 (9개)

| 테이블 | 역할 | 주요 열 |
|---|---|---|
| `users` | 사용자 (챔피언·어드민 공통) | id(PK), email, name, avatar_url |
| `homeworks` | 어드민이 생성한 과제 | id(PK), title, description, due_date, publish_status |
| `submissions` | 챔피언의 최종 제출물 | id(PK), user_id, homework_id, file_path, status(pending·accepted·declined), attempt_number |
| `comments` | 제출물 댓글 | id(PK), submission_id, body, author_role, author_id |
| `charter_submissions` | 챔피언의 과제정의서 | id(PK), user_id, homework_id, project_name, content(jsonb 6섹션), publish_status |
| `charter_comments` | Charter 댓글·답글 (최대 depth 2) | id(PK), charter_submission_id, parent_id, body, author_role, is_resolved |
| `milestones` | 챔피언의 WBS 항목 (2-depth 트리) | id(PK), user_id, homework_id, parent_milestone_id(FK→milestones), week_number, start_date?, due_date?, status, publish_status, bottleneck_type, bottleneck_note |
| `deadline_change_requests` | 기한변경 요청 | id(PK), milestone_id, user_id, original_due_date, requested_due_date, status(pending·approved·rejected) |
| `bottleneck_replies` | 지연 신고 어드민 답변 | id(PK), milestone_id, admin_id, body |

> **v2.0 변경**: `sub_tasks` 테이블 제거 → `milestones.parent_milestone_id`로 통합.
> `milestone_deliverables` 테이블 제거 (산출물 첨부 기능 단순화).

### 6.2 Milestone 상태 자동 계산 규칙 (서버사이드, 우선순위 순)

| 우선순위 | 상태 | 조건 |
|---|---|---|
| 1 | `completed` | `is_manual_completed = true` |
| 2 | `delayed` | `bottleneck_type IS NOT NULL` |
| 3 | `in_progress` | `is_manual_progress = true` (날짜 무관) |
| 4 | `delayed` | `due_date < today` + 위 조건 해당 없음 |
| 5 | `not_started` | 나머지 |

> **v2.0 변경**: `in_progress` 상태는 날짜 무관으로 진행중 섹션에 표시. start_date가 지난 not_started 마일스톤은 지연 섹션으로 이동.

### 6.3 확인 요함 챔피언 판단 기준

| 케이스 | 판단 조건 |
|---|---|
| charter 미제출 | `charterSubmissionId === null` |
| charter 있음, 마일스톤 미등록 | `charterSubmissionId !== null` AND `milestones.length === 0` |

### 6.4 Storage 버킷

| 버킷 | 경로 형식 | 접근 |
|---|---|---|
| `submissions` | `{user_id}/{homework_id}/{attempt}/{filename}` | 비공개, 서명 URL (60s TTL) |

---

## 7. 보안 모델

| 계층 | 정책 |
|---|---|
| 네트워크 | HTTPS 전용 |
| 인증 | Supabase JWT (RS256), Google OAuth |
| 인가 | `is_admin` 메타데이터 + middleware.ts + `verifyAdmin` |
| DB | **RLS DENY ALL** (전 테이블·버킷) |
| 서버 | `service_role key`는 서버 환경변수로만 보관 |
| Nudge API | `verifyJWT` + `user_metadata.is_admin` 추가 확인 |

> **핵심 원칙**: 클라이언트는 **DB에 단 한 번도 직접 접근하지 않는다.** 모든 I/O는 Next.js API Routes를 통과한다.

---

## 8. 기술 스택

### 8.1 주요 라이브러리

| 분류 | 라이브러리 | 버전 | 용도 |
|---|---|---|---|
| 프레임워크 | next | 14.2.35 | App Router |
| UI | react | ^18 | 컴포넌트 |
| 스타일 | tailwindcss | ^3.4.1 | 유틸리티 CSS |
| 컴포넌트 | shadcn/ui (Radix 기반) | — | Dialog, Sheet, AlertDialog 등 |
| 디자인 시스템 | FLO Design System 1.0 | — | CSS 변수·타이포·색상 토큰 (Pretendard) |
| 에디터 | @tiptap/react | ^3.23.4 | Charter WYSIWYG |
| 드래그앤드롭 | @dnd-kit/core | ^6.3.1 | 칸반 DnD |
| Gantt | gantt-task-react | ^0.3.9 | WBS 시각화 |
| DB·인증 | @supabase/supabase-js | ^2.105.4 | DB / Auth 클라이언트 |
| 이메일 | nodemailer | ^8.0.7 | SMTP 발송 |
| DOCX | docx | ^9.6.1 | Charter 내보내기 |
| 알림 | sonner | ^2.0.7 | 토스트 UI |
| 패키지 관리 | bun | 1.x | 의존성·빌드 |

### 8.2 환경변수 목록

| 키 | 용도 | 보관 위치 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 빌드 ARG + 런타임 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개 키 | 빌드 ARG + 런타임 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 서비스 키 | 런타임 전용 (절대 빌드 ARG 금지) |
| `GMAIL_USER` | SMTP 발신 계정 | 런타임 |
| `GMAIL_APP_PASSWORD` | Gmail 앱 비밀번호 | 런타임 |
| `ADMIN_NOTIFICATION_EMAIL` | 알림 수신 어드민 이메일 | 런타임 |
| `APP_BASE_URL` | 이메일 본문 링크 기반 URL | 런타임 |

### 8.3 인프라 및 CI/CD

| 항목 | 선택 | 비고 |
|---|---|---|
| 런타임 | Docker (Next.js standalone) | Node.js 18-alpine 기반 |
| 오케스트레이션 | Docker Compose | 컨테이너명 `ax-homework-frontend` |
| CI | GitHub Actions (Bun 기반) | PR + main push 시 lint · typecheck · build |
| CD | Jenkins (서버 직접 빌드·기동) | `ax-dsp-search` 동일 패턴 |
| DB / Auth | Supabase (관리형 PaaS) | 마이그레이션 018 이상 적용 완료 |

---

## 9. 주요 라우트 참조

| 유형 | 경로 | 설명 |
|---|---|---|
| 챔피언 | `/` | 과제 목록 |
| 챔피언 | `/my-project/charter` | Charter 작성·제출 |
| 챔피언 | `/my-project/milestones` | WBS 관리 (2-depth 트리 + 체크인) |
| 챔피언 | `/progress` | 진행 대시보드 (개발 중) |
| 어드민 | `/admin` | 챔피언 전체 현황 (Gantt + 확인 요함 + Nudge) |
| 어드민 | `/admin/kanban` | 칸반 판정 보드 |
| 어드민 | `/admin/homework/new` | 과제 생성 |
| 어드민 | `/admin/homework/[id]/edit` | 과제 편집 |
| 어드민 | `/admin/requests` | 기한변경 요청 목록 |
| 어드민 | `/admin/delay-reports` | 지연 신고 검토 |
| 어드민 | `/admin/reports` | 주간 리포트 (PDF 인쇄·주차 네비) |
| 어드민 | `/admin/champions/[userId]` | 챔피언 개별 상세 |

---

## 10. API 현황

| 그룹 | 엔드포인트 수 | 인증 방식 |
|---|---|---|
| 챔피언 API | 16 | `verifyJWT` |
| 어드민 API | 14 | `verifyJWT` + `verifyAdmin` |
| 인증 | 1 | OAuth 콜백 |
| **합계** | **31** | — |

> v1.2 대비 +4 (milestones 트리 지원, `/api/admin/nudge`, `/api/admin/delay-reports`, `/api/champions/gantt` 개선)

---

## 11. WBS 및 개발 일정 (공수 기준)

> 공수 단위: **MD (Man-Day)**, 1 MD = 1인 1일 기준

### 11.1 완료 구간 (2026-05-14 ~ 2026-06-02) · 실적 12 MD

| WBS # | 날짜 | 주요 작업 | 공수 (MD) | 상태 |
|---|---|---|:---:|---|
| 1.0 | 05/14 | 설계 Day 1 — 과제 제출 플로우 스펙, DB 초기 설계, Supabase·Google OAuth | 1 | ✅ |
| 2.0 | 05/15 | 설계 Day 2 — Charter 리뷰 스펙, 데이터 모델 확장 | 1 | ✅ |
| 3.0 | 05/18 | 구현 Day 1 — MVP 전체 (Charter·Milestone·칸반·이메일·댓글·shadcn) | 1 | ✅ |
| 4.0 | 05/19 | CI Day — GitHub Actions (Bun), 배포 계획 문서 | 1 | ✅ |
| 5.0 | 05/21 | 구현 Day 2 — Docker·Jenkins CD, 임시저장 전체, PRD 문서화 | 1 | ✅ |
| 6.0 | 05/22~27 | 주간 체크인, 지연 신고 검토, 레이아웃 개선, 추가 이메일 트리거 | 2 | ✅ |
| 7.0 | 05/28~29 | 레이아웃 재설계, 하위과제 스펙 설계 | 1 | ✅ |
| 8.0 | 05/30 | Milestone 2-depth 트리 전환 (parent_milestone_id), DB 마이그레이션 | 1 | ✅ |
| 9.0 | 06/01 | Admin 챔피언 네비, modal UI 개선, 기한 변경 시 status 자동 갱신 | 1 | ✅ |
| 10.0 | 06/02 | 확인 요함·Nudge·리포트 재설계·모바일 UX·기한 변경 모달 | 2 | ✅ |
| **완료 소계** | | | **12 MD** | |

### 11.2 예정 구간 (2026-06-03 이후)

| WBS # | 단계 | 주요 작업 | 공수 (MD) | 우선순위 |
|---|---|---|:---:|---|
| 11.0 | **P0 — 안정화** | 판정 취소 API, Nudge rate limiting, 이메일 에러 핸들링 | 0.5 | 🔴 긴급 |
| 12.0 | **P1 — 챔피언 대시보드** | 챔피언 `/progress` 완성 | 0.5 | 🟠 높음 |
| 13.0 | **P2 — 운영 확장** | 어드민 다중화, SendGrid/SES 마이그레이션 | 1 | 🟡 보통 |
| 14.0 | **P3 — 분석** | 성과 분석 대시보드, In-app 알림 센터 | 2 | 🟢 낮음 |
| 15.0 | **P4 — 화이트라벨** | 멀티-테넌트 기반, 타 프로그램 온보딩 | TBD | 📋 검토 |
| **예정 소계** | | | **4 MD** | |

### 11.3 총 공수 요약

| 구분 | 공수 |
|---|---|
| 완료 (05/14 ~ 06/02) | **12 MD** |
| 예정 P0~P4 | 4 MD |
| **총합** | **16 MD (약 0.8 MM)** |

---

## 12. 리스크 관리

| # | 리스크 | 가능성 | 영향도 | 대응 방안 |
|---|---|---|---|---|
| R1 | Gmail SMTP 일일 발송 한도 (500건) 초과 | 중 | 중 | SendGrid / SES 마이그레이션 (P2) |
| R2 | 단일 어드민 메일박스 라우팅 한계 | 고 | 중 | 어드민 다중화 + 과제별 담당자 매핑 (P2) |
| R3 | 단방향 DnD — 오판정 복구 불가 | 중 | 고 | 어드민 전용 "판정 취소" API (P0) |
| R4 | Nudge 재발송 제한 없음 | 중 | 중 | 동일 챔피언 rate limiting 도입 (P0) |
| R5 | 이메일 fire-and-forget 미처리 rejection | 중 | 저 | try-catch 래핑 + 에러 로깅 (P0) |
| R6 | Charter content JSONB 스키마 변경 | 저 | 중 | content 버전 필드 도입 + 점진적 마이그레이션 |
| R7 | 챔피언 이메일 차단 시 알림 누락 | 중 | 중 | In-app 알림 센터 (P3) |
| R8 | Gmail 앱 비밀번호 노출 | 저 | 고 | 서버 환경변수 격리, 정기 로테이션, SendGrid 전환 |

---

## 13. 성공 지표 (KPI)

### 13.1 사용자 채택률

| 지표 | 정의 | 목표 |
|---|---|---|
| 챔피언 주간 활성률 | 주간 로그인 + 1회 이상 활동한 챔피언 비율 | ≥ 70% of cohort |
| Charter 제출 완료율 | `submitted_at IS NOT NULL` / 배정 과제 수 | ≥ 90% |
| Milestone 평균 등록 수 | 챔피언 1인당 평균 WBS 항목 수 | ≥ 4개 |

### 13.2 운영 효율성

| 지표 | 정의 | 목표 |
|---|---|---|
| 평균 검토 리드타임 | `submitted_at` → 상태 변경까지 경과 시간 | ≤ 24시간 |
| Nudge → Charter 제출 전환율 | Nudge 발송 후 48h 내 charter 제출 비율 | 모니터링 (기준값 수립) |
| 기한변경 응답 시간 | `created_at` → `reviewed_at` 경과 시간 | ≤ 12시간 |

### 13.3 품질·안정성

| 지표 | 정의 | 목표 |
|---|---|---|
| 이메일 도달률 | SMTP 성공 건수 / 전체 시도 건수 | ≥ 99% |
| 재제출률 | `declined` 후 재제출한 챔피언 비율 | 모니터링 (기준값 수립) |
| 시스템 오류율 | 5xx 응답 수 / 전체 요청 수 | ≤ 0.1% |

---

## 14. 부록

### A. 관련 문서

| 문서 | 경로 | 내용 |
|---|---|---|
| ERD | `docs/ERD.md` | 데이터 모델 상세 |
| FLO Design System | `DESIGN.md` | 디자인 토큰·컴포넌트 가이드 |
| Docker 배포 가이드 | `docs/deployment/docker.md` | Jenkins 배포 절차 |
| README | `README.md` | 로컬 실행·배포 가이드 |

### B. 개발 이력 요약 (주요 커밋 기준)

| 날짜 | 주요 작업 |
|---|---|
| 2026-05-14 | 프로젝트 초기화, 과제 제출 MVP, Supabase 마이그레이션 1차 |
| 2026-05-15 | Charter 리뷰 기능, 챔피언·어드민 댓글 시스템 |
| 2026-05-18 | 이메일 알림 7트리거, 칸반 재설계, shadcn/ui 통일, UI 폴리시 |
| 2026-05-19 | 임시저장 기능 설계 및 스펙 확정 |
| 2026-05-20~21 | 임시저장 전체 구현, CI/CD 파이프라인 완성 |
| 2026-05-22~27 | 주간 체크인, 지연 신고 검토, 추가 이메일 트리거, 레이아웃 개선 |
| 2026-05-28~29 | 레이아웃 재설계, 하위과제 스펙 |
| 2026-05-30 | Milestone 2-depth 트리 전환, DB 마이그레이션, Gantt 버그 수정 |
| 2026-06-01 | Admin 챔피언 네비, modal UI 개선, status 자동 갱신 버그 수정 |
| 2026-06-02 | 확인 요함 섹션, Champion Nudge, 리포트 재설계, 모바일 UX, 기한 변경 모달 |

---

**문서 끝**
