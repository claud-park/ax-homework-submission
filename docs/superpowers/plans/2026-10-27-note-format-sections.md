# 1:1 노트 형식 세분화 (논의 주제·피드백·고민·합의) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI가 만드는 1:1 노트를 요약 불릿 한 덩어리가 아니라 `🗣️ 논의 주제 / 💬 피드백 / 🤨 고민·요청 사항 / 🤝 합의 사항` 섹션 구조(markdown 문법 적용)로 만들고, Slack으로 공유할 때는 markdown 문법 없이 붙여 넣기 편한 형식으로 바꿔 주는 `[Slack용 복사]`를 제공한다.

**배경:** 지금 AI 노트는 `- ` 불릿 5~8개뿐이고 액션 아이템은 별도 목록이다. 사용자가 기대하는 형식(to-be)은 주제별 번호 소제목, 피드백, 고민·요청, 합의 사항이 구분된 문서다. 이 형식은 앱 노트 화면에서는 markdown(제목·굵게·목록)으로 보이고, Slack에는 `##`, `**`가 그대로 보이지 않도록 Slack 형식으로 공유한다.

**Architecture:** (1) 요약 프롬프트가 섹션 구조의 markdown을 만든다. 저장·편집은 기존처럼 markdown이다(TipTap 에디터가 markdown으로 왕복하므로 저장 형식은 markdown 유지). (2) Slack으로 나가는 경로는 변환으로 해결한다: recap DM/초안은 기존 `toSlackMrkdwn`(검증됨), 수동 공유는 새 순수 함수 `notesToSlackText` + 버튼.

**Tech Stack:** Next.js, `ai` + `@ai-sdk/anthropic`, vitest.

**Spec:** 요청 메시지의 as-is/to-be 예시 (이 계획이 spec을 겸한다)

## Global Constraints

- 노트 저장 형식은 markdown 그대로. 에디터(TipTap + tiptap-markdown, StarterKit: 제목 1~3, 굵게, 목록)가 왕복해도 깨지지 않는 문법만 쓴다: `##`, `###`, `**굵게**`, `- ` 불릿(하위는 2칸 들여쓰기), `1.` 번호 목록. 표, `---` 수평선, `- [ ]` 체크박스, 코드 블록, 인용은 AI 노트에 쓰지 않는다.
- 액션 아이템은 기존처럼 노트 본문이 아니라 별도 `actionItems` 배열로 둔다(앱의 체크 목록과 recap DM이 이미 이를 쓴다). `body`는 담당자가 분명하면 `담당자: 할 일` 형태의 일반 텍스트(markdown 문법 없음), 모르면 할 일만.
- JSON 응답 형식(`{ notes, actionItems }`)과 `parseSummaryResponse`, `SummaryParseError` 동작은 바꾸지 않는다. 파이프라인 순서·락·`processing_*` 동작은 건드리지 않는다.
- 섹션은 내용이 없으면 생략한다(`🗣️ 논의 주제`만 항상 포함). 화자 이름을 지어내지 않는다: 전사에 화자 구분이 없으므로 발언 주체가 분명할 때만 `Admin`/`챔피언` 또는 전사에 나온 이름을 쓴다. 전사에 없는 사실을 추가하지 않는다.
- 길이: recap DM이 약 2,900자에서 잘리므로 노트 전체를 가능하면 3,000자 안팎으로 간결하게(논의 주제의 세부는 핵심만).
- 새 의존성 없음, `bun.lock` 변경 없음. 사용자 문구는 해요체.
- Slack 형식 변환은 기존 `toSlackMrkdwn`/`extractAiSummary`/`buildRecapText` 동작을 바꾸지 않는다(이미 운영 중, 리뷰됨). 새 변환은 별도 함수로 둔다.

## Review Focus

- 프롬프트가 에디터 왕복에 안전한 문법만 요구한다(체크박스·표·수평선 금지)고 명시하고, 빈 섹션 생략, 화자 지어내기 금지가 들어 있다.
- 새 구조의 markdown을 기존 `toSlackMrkdwn`에 넣으면 recap DM에서 `*제목*`, `•` 불릿, 번호 소제목이 올바르게 나온다.
- `notesToSlackText`: 변환 결과에 `##`, `**`, `---`, `- [ ]` 같은 markdown 문법이 남지 않고, `&`, `<`, `>`는 이스케이프하지 않으며(수동 붙여넣기용), 링크는 `라벨 (url)`로 풀어 쓴다.
- 사용자가 직접 쓴 노트 + AI 구분선(`---` / `**🤖 AI 요약**`)이 섞인 결합 노트도 Slack용으로 깨지지 않는다.

---

### Task 1: 요약 프롬프트를 섹션 구조로

**Files:**
- Modify: `lib/audio-pipeline/summarize.ts` (`buildSummaryPrompt`를 export, 프롬프트 교체)
- Test: `test/lib/summary-prompt.test.ts`, `test/lib/recap-format.test.ts` (to-be 구조 markdown → `toSlackMrkdwn` 고정 테스트 추가)

**Interfaces:**
- Produces: `export function buildSummaryPrompt(transcript: string): string` (기존 비공개 함수를 export; 시그니처 동일). 반환 JSON 형식은 그대로 `{ "notes": string, "actionItems": [{ "body": string }] }`.
- 프롬프트가 요구하는 `notes` 구조(예시 그대로 프롬프트에 포함):
  ```
  ## 🗣️ 논의 주제
  ### 1. 주제 제목
  - 핵심 내용
    - 세부 내용
  ### 2. 주제 제목
  - 핵심 내용

  ## 💬 피드백
  - 피드백 내용

  ## 🤨 고민·요청 사항
  - 고민 또는 요청 내용

  ## 🤝 합의 사항
  1. 합의 내용
  ```

- [ ] **Step 1: Write the failing tests** (`test/lib/summary-prompt.test.ts`): 프롬프트에 transcript가 들어간다; 네 섹션 제목 문자열 `## 🗣️ 논의 주제`, `## 💬 피드백`, `## 🤨 고민·요청 사항`, `## 🤝 합의 사항`과 소제목 예시 `### 1.`이 있다; 금지 사항 문구(표, 수평선, 체크박스, 코드 블록 금지)가 있다; "내용이 없는 섹션은 생략(논의 주제 제외)", "화자 이름을 지어내지 않는다", "전사에 없는 내용을 추가하지 않는다", "JSON으로만 응답"이 있다; `actionItems`에 `담당자: 할 일` 형식 안내와 "markdown 문법 없이"가 있다. `test/lib/recap-format.test.ts`에 추가: 위 구조의 markdown 예시(제목 2단계·3단계, 굵게, 2칸 들여쓴 하위 불릿, 번호 목록)를 `toSlackMrkdwn`에 넣으면 정확히 `*🗣️ 논의 주제*`, `*1. 주제 제목*`, `• 핵심 내용`, `  • 세부 내용`, `*💬 피드백*`, `1. 합의 내용` 줄이 나오는 `toBe` 비교(전체 문자열).
- [ ] **Step 2: Run** `npx vitest run test/lib/summary-prompt.test.ts test/lib/recap-format.test.ts` — Expected: FAIL (summary-prompt: export 없음)
- [ ] **Step 3: Implement** the prompt (한국어, 위 구조·규칙·Global Constraints 반영; JSON 외 텍스트 금지 문구 유지; 기존 `parseSummaryResponse`/`summarizeTranscript`는 수정하지 않는다).
- [ ] **Step 4: Run** the focused tests, `npx tsc --noEmit`, full suite — Expected: PASS
- [ ] **Step 5 (선택, 비밀 출력 금지):** `ANTHROPIC_API_KEY`가 메인 체크아웃 `.env.local`에 있으면 `set -a; . /Users/claud_01/Documents/flo/AX/ax-homework-submission/.env.local 2>/dev/null; set +a`로 환경만 로드해, 스크래치 디렉터리의 일회성 스크립트(저장소 밖)로 한국어 합성 전사(약 300자, 논의 주제 2개·피드백·합의·액션 아이템이 섞인 내용)에 `summarizeTranscript`를 한 번 실행해 출력 형식을 보고서에 첨부한다(키·전사 원문 외 민감 정보 출력 금지). 없으면 건너뛴다고 보고서에 적는다.
- [ ] **Step 6: Commit** `git add lib/audio-pipeline/summarize.ts test/lib/summary-prompt.test.ts test/lib/recap-format.test.ts && git commit -m "[AX-1] feat(notes): 요약 노트를 논의 주제·피드백·고민·합의 섹션 구조로"`

---

### Task 2: Slack용 복사 (markdown 문법 제거)

**Files:**
- Create: `lib/notes/slackText.ts`
- Create: `components/sessions/CopySlackButton.tsx`
- Modify: `components/sessions/AdminSessionDetail.tsx`, `components/sessions/ChampionSessionDetail.tsx` (노트 표시 영역에 버튼)
- Test: `test/lib/notes-slack-text.test.ts`

**Interfaces:**
- Produces: `notesToSlackText(notes: string): string` — 순수 함수. 규칙:
  - `#`~`######` 제목 → `*제목*` (굵게는 Slack 단일 별표, 제목 안의 `**`는 제거), 앞 빈 줄 유지
  - `**굵게**`/`__굵게__` → `*굵게*`; 줄 안 `*기울임*`/`_기울임_`은 `_기울임_`
  - `- `/`* ` 불릿 → `• `, 들여쓴 하위 불릿 → 들여쓰기 유지 + `◦ `
  - `1.` 번호 목록은 그대로, `- [ ]` → `☐ `, `- [x]` → `☑ `
  - `---`/`***` 수평선 → `──────────`
  - 링크 `[라벨](url)` → `라벨 (url)`; 이미지 `![alt](url)` → `alt (url)`
  - 인용 `> ` 제거, 인라인 코드 백틱 제거(내용 유지)
  - AI 구분선(`\n---\n\n**🤖 AI 요약**\n`, 에디터 왕복 변형 포함 — `lib/audio-pipeline/notes.ts`의 `AI_DIVIDER_RE`로 인식)은 `──────────\n*🤖 AI 요약*`로
  - `&`, `<`, `>`는 이스케이프하지 않는다(Slack 입력창에 붙여 넣는 용도). 연속 빈 줄은 하나로 줄이고 끝 공백 제거.
- `CopySlackButton({ notes }: { notes: string })` — `[Slack용 복사]` 버튼. `navigator.clipboard.writeText(notesToSlackText(notes))`; 성공 토스트 "Slack용으로 복사했어요. Slack에 붙여 넣어 주세요.", 실패 시 토스트 "복사하지 못했어요. 브라우저 권한을 확인해 주세요."; 노트가 비어 있으면 버튼을 렌더하지 않는다.

- [ ] **Step 1: Write the failing tests** (`test/lib/notes-slack-text.test.ts`) — 전체 문자열 `toBe`로: (a) Task 1의 섹션 구조 예시 전체 → 기대 Slack 텍스트(제목 `*…*`, `• `/`◦ `, 번호 목록 유지, 굵게 `*x*`); (b) 사용자 노트 + AI 구분선 + AI 노트 결합본 → 구분선이 `──────────\n*🤖 AI 요약*`; 에디터 왕복 변형 구분선(`*🤖 AI 요약*`)도 동일; (c) `- [ ] 할 일`/`- [x] 한 일` → `☐ 할 일`/`☑ 한 일`; (d) 링크·이미지·인용·백틱; (e) `&`/`<`/`>`가 그대로 남는다(`A & B < C > D`); (f) 결과에 `##`, `**`, `---`, `](`가 남지 않는다(속성 테스트: 위 입력들에 대해 정규식 검사); (g) 빈 문자열/공백만 → 빈 문자열; (h) 연속 빈 줄 축약.
- [ ] **Step 2: Run** `npx vitest run test/lib/notes-slack-text.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `notesToSlackText` and `CopySlackButton` (스타일은 노트 영역의 기존 작은 버튼 스타일을 따른다; lucide 아이콘 `Copy` 사용 가능).
- [ ] **Step 4: Wire** the button next to the notes in `AdminSessionDetail.tsx` (`<MarkdownView markdown={notes} />` 근처, 보기 모드에서) and `ChampionSessionDetail.tsx` (`<MarkdownView markdown={session.notes} />` 근처). 편집 중에는 버튼을 숨겨도 된다(보기 모드에서만). 기존 레이아웃을 깨지 않게 노트 제목 줄 오른쪽에 둔다.
- [ ] **Step 5: Run** the focused test, `npx tsc --noEmit`, `npm run lint` (touched files 오류 없음), full suite, `npx next build` (env: `set -a; . /Users/claud_01/Documents/flo/AX/ax-homework-submission/.env.local 2>/dev/null; set +a`) — Expected: 모두 통과
- [ ] **Step 6: Commit** `git add lib/notes components/sessions test/lib/notes-slack-text.test.ts && git commit -m "[AX-1] feat(notes): Slack용 복사 (markdown 문법 제거)"`
