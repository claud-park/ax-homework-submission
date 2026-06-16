# 마일스톤 입력 UX 개선 — 설계 문서

> **작성일** 2026-06-16 · **작성자** yr.park@dreamus.io
> **상태** 설계 확정 (구현 대기) · **브랜치** `feature/milestone-enhancement`
> **관련 문서** [PRD](../../PRD.md) · [PRD-KO](../../PRD-KO.md) · [ERD](../../ERD.md)

---

## 1. 배경 & 문제

Champion이 Charter 페이지의 Timeline 섹션에서 마일스톤을 등록할 때, 현재는 **`+ 추가` 버튼 → 이름 + 기간(시작·종료) 3개 필드 입력 → 저장**을 마일스톤마다 처음부터 반복해야 한다. 서브 마일스톤도 부모마다 따로 링크를 눌러 추가한다.

페인포인트:
- 일괄/대량 입력 수단이 없다 — 하나씩만 추가 가능
- 폼 토글이 매번 필요하고 한 번에 하나만 열린다
- 세 필드를 모두 채워야 저장된다
- 머릿속/문서에 계획이 있어도 빠르게 옮겨 담을 방법이 없다
- 계획이 막연한 champion을 도와주는 장치가 없다

Champion은 입력 시작 시점이 **둘 다 섞여 있다** — 계획이 이미 있는 경우와 막연한 경우가 공존한다. 따라서 "빠른 입력"과 "도와주는 입력" 두 축을 모두 지원한다.

## 2. 목표 & 비목표

**목표**
- 단일 진입점에서 세 가지 방법(AI 생성 / 템플릿 / 직접 입력)으로 마일스톤을 채운다
- 생성 결과를 **저장 전에** 편집·정렬·삭제할 수 있는 초안(Staging) 영역을 제공한다
- 여러 마일스톤을 **한 번에 일괄 저장**해 "하나씩 클릭" 페인포인트를 제거한다
- Charter 본문(문제·목표·솔루션 등)을 읽어 AI가 마일스톤 초안을 제안한다

**비목표 (YAGNI)**
- CSV/스프레드시트 파일 업로드 import
- 자연어 한 줄 파싱("6월까지 MVP" → 자동 분해) — 이번 범위 제외
- 표(그리드) 우선 편집 UI (방향 C는 채택 안 함)
- 마일스톤 간 의존성(선후행) 그래프

## 3. 채택 방향 — A: 생성 → 편집 가능한 초안 목록 (Staging)

레퍼런스: Linear(이슈 일괄 생성·프로젝트 생성), Height, Asana 임시 목록, Notion AI(생성 엔진).

```
[Timeline 헤더] + 마일스톤 추가 ▾
   ├─ ✨ AI로 생성   ┐
   ├─ 📋 템플릿에서   ├─→ 단일 Drawer 진입
   └─ ✏️ 직접 입력    ┘
        ↓
[Drawer] 상단: 방법별 입력 (AI 탭 / 템플릿 탭 / 직접)
        ↓
[Drawer] 본문: 편집 가능한 초안 목록 (미저장)
        - 인라인 편집(제목·기간), 드래그 정렬, 서브 마일스톤, 행 추가/삭제
        ↓
[Drawer] 하단: "N개 마일스톤 저장" → batch 커밋 → Timeline 갱신
```

세 방법 모두 같은 초안 목록으로 수렴한다. 기존 인라인 추가/편집/삭제 로직은 유지되어 직접 입력 경로와 호환된다.

## 4. 컴포넌트 설계 (프론트엔드)

| 파일 | 역할 | 의존 |
|---|---|---|
| `MilestoneDraftDrawer.tsx` | Drawer 셸. 탭(AI/템플릿/직접) + 초안 목록 + 일괄 저장. 로컬 상태 `draftRows: DraftMilestone[]` | DateRangePicker, api-client |
| `MilestoneDraftRow.tsx` | 초안 1행 인라인 편집(제목, DateRangePicker, 서브 토글, 삭제, 드래그 핸들) | DateRangePicker |
| `lib/milestone-templates.ts` | 프리셋 정의(상대 기간 + 계층). 순수 데이터 | — |
| `lib/milestone-schedule.ts` | 상대 기간(offset/duration) → 절대 날짜 변환. 주말·공휴일 스킵 | DateRangePicker의 working-days 로직 공유 |

`TimelineSection`(CharterClient 내부)의 기존 `+ 추가` 토글을 `+ 마일스톤 추가 ▾` 메뉴로 교체한다. `lib/milestone-schedule.ts`로 working-days 계산을 추출해 `DateRangePicker`와 공유한다(중복 제거).

**`DraftMilestone` 타입(클라이언트 전용, 미저장 상태)**
```ts
interface DraftMilestone {
  tempId: string            // 클라 측 임시 키
  title: string
  description?: string
  start_date: string | null // YYYY-MM-DD (계산 후 확정)
  due_date: string | null
  children?: DraftMilestone[] // 1단계 깊이만
  source: 'ai' | 'template' | 'manual'
}
```

## 5. API 설계 (서버)

### 5.1 `POST /api/milestones/generate`
- **인증**: 기존 `verifyJWT` 패턴 재사용
- **요청**: `{ prompt?: string, useCharter: boolean, startDate: string }`
- **처리**: `useCharter`면 사용자의 최신 `charter_submissions.content`(problem·user·goal·solution·build)를 읽어 시스템 프롬프트에 주입 → AI SDK `generateObject(schema)` 호출 → **DB에 저장하지 않고** 결과 반환
- **응답**: `{ milestones: GeneratedMilestone[] }` (상대 기간 형태)
- **모델**: 기본 `claude-haiku-4-5`, 환경변수 `MILESTONE_AI_MODEL`로 교체 가능
- **재시도**: 스키마 불일치·빈 출력 시 1회 재시도, 그 후 실패 응답

**AI 출력 스키마 (Zod)**
```ts
const GeneratedMilestone = z.object({
  title: z.string(),
  description: z.string().optional(),
  offset_days: z.number().int().min(0),  // 프로젝트 시작 기준 시작 오프셋(작업일)
  duration_days: z.number().int().min(1), // 기간(작업일)
  children: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    offset_days: z.number().int().min(0),
    duration_days: z.number().int().min(1),
  })).optional(),
})
const Output = z.object({ milestones: z.array(GeneratedMilestone) })
```

> **핵심 분리**: AI는 **구조와 상대 기간만** 생성한다. 절대 날짜는 결정론적 코드(`milestone-schedule.ts`)가 `startDate` 기준으로 작업일(주말·공휴일 제외)을 환산해 확정한다. AI에게 날짜 계산을 맡기지 않아 공휴일/요일 오류를 원천 차단한다.

### 5.2 `POST /api/milestones/batch`
- **인증**: `verifyJWT`
- **요청**: `{ milestones: NewMilestone[] }` (각 항목에 `source`, `parent` 관계 포함)
- **처리**: 부모(depth-0) 먼저 insert → 반환된 id로 자식(depth-1)에 `parent_milestone_id` 매핑해 insert → `syncParentDates` **한 번** 호출. `publish_status = 'published'`로 생성. 각 행에 `source` 기록
- **원자성**: 부분 실패 방지를 위해 Supabase RPC(트랜잭션 함수)로 묶거나, 실패 시 생성분 롤백 후 에러 반환. 사용자에겐 "전부 성공 / 전부 실패"로만 노출
- **응답**: `{ milestones: Milestone[] }`

## 6. 데이터 흐름

```
AI 탭   → POST /generate → GeneratedMilestone[] → schedule 변환 → draftRows (미저장)
템플릿  → milestone-templates → schedule 변환 → draftRows (미저장, 클라에서)
직접    → 빈 draftRow 1개
   ↓ 인라인 편집/정렬/서브/추가/삭제
"N개 저장" → POST /batch → 성공 시 setMilestones 갱신 + Drawer 닫기 + toast
```

## 7. 스키마 변경

기능 자체는 기존 `milestones` 테이블을 재사용하므로 **강제 스키마 변경은 없다.** 다만 "smart" 기능의 채택률(AI/템플릿 vs 수동)을 측정하기 위해 **`milestones.source` 컬럼 1개를 추가**한다. PRD의 분석 KPI(§9)와 정렬된다.

```sql
-- supabase/migrations/023_milestone_source.sql
ALTER TABLE milestones
  ADD COLUMN source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'ai', 'template'));
```

- 기본값 `manual` → 기존 행·직접 입력 행 모두 안전
- batch 저장 시 각 행의 출처를 기록
- ERD §`milestones` 및 PRD §6 데이터 모델에 반영

## 8. 에러 처리 & 엣지 케이스

| 상황 | 처리 |
|---|---|
| AI 실패(타임아웃·빈 출력·스키마 불일치) | 1회 재시도 → toast(`초안 생성에 실패했어요. 다시 시도하거나 템플릿을 사용해 주세요`) + Drawer 빈 상태 유지(입력 손실 없음) |
| Charter 비어있음 + useCharter ON | 프롬프트만으로 생성, 안내 문구 노출 |
| 초안 검증 | 행별 제목 필수 · `start_date ≤ due_date`. 위반 행 인라인 에러, 저장 버튼 비활성 |
| batch 부분 실패 | 롤백 후 에러 — "일부만 저장됨" 상태 금지 |
| 빈 초안 저장 | 행 0개면 저장 비활성 |
| AI 호출 남용 | 생성 진행 중 버튼 비활성/로딩 표시 |

## 9. 테스트 전략

| 대상 | 테스트 |
|---|---|
| `milestone-schedule` (**최우선**) | 상대 기간→절대 날짜, 주말·공휴일 스킵, offset 누적 단위 테스트 |
| `milestone-templates` | 각 프리셋 전개 결과 스냅샷 |
| `POST /api/milestones/generate` | 모킹된 AI 출력 스키마 검증, Charter 주입 유무 분기, 인증 가드 |
| `POST /api/milestones/batch` | 부모-자식 매핑, `syncParentDates` 호출, 부분 실패 롤백, `source` 기록 |
| `MilestoneDraftDrawer` | 행 추가/삭제/편집, 검증 비활성, 저장 호출 |

## 10. 템플릿 프리셋 (초안)

| 프리셋 | 구성(상대 기간) |
|---|---|
| 제품 출시 | 리서치&정의(1주) → 설계(1주) → MVP 개발(3주) → 베타 테스트(2주) → 출시 준비(1주) |
| 리서치 → MVP → 검증 | 문제 리서치(2주) → MVP(3주) → 사용자 검증(2주) |
| 스프린트 / 해커톤 | 기획(1일) → 개발(3일) → 데모 준비(1일) |

각 프리셋은 `startDate` 기준으로 작업일 환산되어 초안 목록에 채워진다. 이후 champion이 자유 편집한다.

## 11. 기술 의존성 추가

| 라이브러리 | 용도 |
|---|---|
| `ai` (Vercel AI SDK v6) | `generateText` + `Output.object` 구조화 출력 |
| `@ai-sdk/anthropic` | Anthropic 프로바이더 직접 연결 (`claude-haiku-4-5` 기본) |
| `zod` | AI 출력 스키마 검증 |

**환경변수 추가**: `ANTHROPIC_API_KEY`(필수) + `MILESTONE_AI_MODEL`(선택, 기본 `claude-haiku-4-5`).

> 구현 메모: `generateObject`는 AI SDK v6에서 deprecated → `generateText` + `Output.object({ schema })`로 구현. LLM 연결은 Vercel AI Gateway가 아닌 **Anthropic 직접 연결**(`@ai-sdk/anthropic`)을 채택(자가호스팅 Docker 환경).
