# 대화형 AI 마일스톤 생성 — 설계 문서

> **작성일** 2026-06-16 · **작성자** yr.park@dreamus.io
> **상태** 설계 확정 (구현 대기) · **브랜치** `feature/conversational-milestone`
> **선행** [마일스톤 입력 UX 설계](2026-06-16-milestone-input-ux-design.md) (원샷 생성) · PR #21, #22 머지·배포 완료

---

## 1. 배경 & 문제

현재 AI 마일스톤 생성은 **원샷**이다: 프롬프트 + Charter → `generateText` 1회 → 초안 목록 생성 → 끝. 결과를 바꾸려면 직접 편집하거나 처음부터 재생성해야 한다. champion이 "베타를 2주로 늘려", "리서치 단계 빼" 같이 **AI와 주고받으며 다듬는** 흐름이 없다.

이를 **반복 수정형(iterative refinement)** 대화로 확장한다.

## 2. 목표 & 비목표

**목표**
- 초안 생성 후, 자연어 지시로 AI가 초안을 **반복 수정**
- **화면의 현재 초안**(사용자 수동 편집 포함)을 기준으로 수정
- 토큰을 최소로 유지 (수정 턴은 Charter 제외, 대화 이력 미축적)
- 원샷 생성의 대원칙 유지: **AI는 구조·상대기간만, 날짜는 결정론적 코드**

**비목표 (YAGNI)**
- 자유 대화(잡담)·항목별 개별 대화
- 좌우 분할/풀 챗봇 UI (모바일 부적합)
- 서버측 대화 세션 저장·멀티유저 동기화
- 하드 turn cap (턴당 비용이 일정·저렴 → 불필요; 상위 안전망은 Anthropic spend limit)

## 3. UX (레이아웃 A — 하단 수정바)

```
[Drawer · AI 탭]
  ✨ 생성 (첫 턴: 프롬프트 + Charter)
  ────────────────
  편집 가능한 초안 목록 (제자리 갱신)
  ────────────────
  💬 [수정 지시 입력]  [수정 ▸]      ← 초안이 1개 이상일 때만 표시
  ↺ 최근: "베타 2주로", "리서치 단축"  ← 표시용 칩 1~2개 (AI에 안 보냄)
```
- 초안이 없으면 수정바 미표시
- 수정 결과는 목록을 **제자리 갱신**(전체 교체), 모든 행 `source: 'ai'`
- 저장은 기존 일괄 저장(batch) 그대로

## 4. 핵심 설계: 날짜 처리 (relative ↔ absolute)

화면 초안은 **절대 날짜**(start_date/due_date)지만 AI에게 날짜 계산을 시키지 않는다. 수정 요청 전후로 변환한다.

```
현재 초안(절대)
  → draftToRelative(milestones, startDate)        # 워킹데이 offset/duration 역산
  → buildRefinePrompt(relative, instruction)      # Charter 없음
  → generateText + Output.object(GenerationOutputSchema)   # AI: 상대형 수정본
  → scheduleRelativeMilestones(startDate, …)      # 절대 날짜로 재스케줄
  → 초안(절대) 갱신
```
- AI는 끝까지 날짜 계산 안 함 (공휴일/요일 오류 차단)
- 사용자의 수동 날짜 편집도 "기간 변경"으로 자연스럽게 반영
- 트레이드오프: 수동으로 주말/공휴일에 맞춘 날짜는 다음 AI 턴에서 워킹데이로 재정규화될 수 있음(사소)

## 5. 컴포넌트 · API

| 파일 | 변경 | 역할 |
|---|---|---|
| `lib/milestone-schedule.ts` | 수정 | `draftToRelative(scheduled, startDate, holidays?)` 추가 — `scheduleRelativeMilestones`의 역함수. `offset_days` = projectStart~start 워킹데이, `duration_days` = `countWorkingDays(start, due)` |
| `lib/milestone-ai.ts` | 수정 | `buildRefinePrompt(milestones: RelativeMilestone[], instruction: string)` 추가 — Charter 미포함, 현재 초안(상대형)+지시만 |
| `app/api/milestones/refine/route.ts` | 신규 | 얇은 핸들러: `verifyJWT` → `draftToRelative` → `buildRefinePrompt` → `generateText`+`Output.object` → `scheduleRelativeMilestones` → `{ milestones }`. **DB 저장 안 함**. 모델은 `/generate`와 동일(`process.env.MILESTONE_AI_MODEL ?? 'claude-haiku-4-5'`, `anthropic(MODEL)`) |
| `components/milestones/MilestoneDraftDrawer.tsx` | 수정 | 하단 수정바(초안>0일 때), `handleRefine`, `refining` 상태, 최근 지시 칩 |

**요청/응답 (`POST /api/milestones/refine`)**
- 요청: `{ milestones: DraftMilestone[](절대), startDate: string, instruction: string }`
- 응답: `{ milestones: ScheduledMilestone[](절대) }`
- 출력 스키마: 기존 `GenerationOutputSchema` 재사용 (offset/duration, children 1단계)

## 6. 데이터 흐름

```
[수정바] 지시 입력 → 수정 ▸
 → POST /api/milestones/refine { milestones(절대), startDate, instruction }
 → 서버: draftToRelative → buildRefinePrompt → generateText(Output.object)
        → scheduleRelativeMilestones → { milestones(절대) }
 → drawer: setRows(갱신, source 'ai') + 최근 지시 칩 추가
 → 저장: 기존 POST /api/milestones/batch
```

## 7. 에러 처리 & 엣지

| 상황 | 처리 |
|---|---|
| refine 실패(타임아웃·스키마·빈 출력) | 1회 재시도 → toast(`수정에 실패했어요. 다시 시도해 주세요`) + 현재 초안 유지 |
| 빈 지시 | 수정 버튼 비활성 |
| 진행 중 | 수정 버튼 Spinner + 비활성(연타 방지) |
| 초안 0개 | 수정바 미표시 |
| AI 이상 출력 | `GenerationOutputSchema.min(1)` 강제로 흡수 |

## 8. 테스트

| 대상 | 테스트 |
|---|---|
| `draftToRelative` (**최우선**) | 라운드트립: `scheduleRelativeMilestones → draftToRelative → scheduleRelativeMilestones` 동일 / 워킹데이 역산 정확 / children 포함 |
| `buildRefinePrompt` | 지시문 + 현재 마일스톤 제목 포함, **Charter 미포함** |
| `/api/milestones/refine` | 인증 가드(401) + (얇은 핸들러, 로직은 lib 커버) |
| `MilestoneDraftDrawer` | 수정바 초안>0일 때만 표시, 빈 지시 비활성, refine 호출·갱신 |

## 9. 토큰 전략

- **수정턴 Charter 제외**: 입력 = 현재 초안(작음) + 지시 + 시스템, 출력 = 초안 → 턴당 비용 거의 일정·소액
- **대화 이력 미축적**: 매 턴 "현재 초안 + 지시"만 → 누적 증가 없음
- **최근 지시 칩은 표시용**, AI에 미전송 → 토큰 0 영향
- haiku 유지 + Anthropic spend limit이 상위 안전망 → 하드 turn cap 불필요
