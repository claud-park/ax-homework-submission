# Charter Format Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF 과제정의서 구조(7개 섹션)에 맞게 charter 포맷을 교체하고 form·view·docx export 전반에 반영한다.

**Architecture:** content JSONB 필드의 키 이름만 교체하며 DB 마이그레이션은 불필요하다. 타입 정의 → API 검증 → champion form → admin view 순서로 변경한다.

**Tech Stack:** Next.js 15 App Router, TypeScript, TipTap, docx npm, Supabase

---

## 파일 맵

| 파일 | 변경 내용 |
|---|---|
| `lib/types.ts` | `ProjectCharter.content` 인터페이스 교체 |
| `app/(champion)/charter/page.tsx` | `SectionKey` 타입, `SECTIONS` 배열, `handleExport` |
| `app/api/charter/submissions/route.ts` | `validateCharter` 필수 필드 목록 |
| `app/api/charter/submissions/[id]/route.ts` | `validateCharter` 필수 필드 목록 |
| `app/admin/progress/page.tsx` | `CharterContent` 타입, `CHARTER_SECTIONS` 배열 |

---

### Task 1: `lib/types.ts` — content 인터페이스 교체

**Files:**
- Modify: `lib/types.ts:62-69`

- [ ] **Step 1: 타입 교체**

`lib/types.ts` 62-69번 라인을 아래로 교체한다:

```typescript
// 기존 (62-69번 라인)
  content: {
    problem_definition?: string
    goal?: string
    scope_in?: string
    scope_out?: string
    expected_outcomes?: string
    risks?: string
  }
```

```typescript
// 변경 후
  content: {
    summary?: string
    problem?: string
    user?: string
    goal?: string
    solution?: string
    build?: string
    timeline?: string
  }
```

- [ ] **Step 2: TypeScript 컴파일 확인**

```bash
cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
npx tsc --noEmit 2>&1 | head -40
```

타입 오류가 발생하면 해당 파일을 확인해 수정한다. 가장 흔한 오류는 아직 수정 전인 파일에서 old key를 참조하는 것이다 — 다음 Task에서 순차 수정하므로 지금은 오류가 있어도 진행한다.

- [ ] **Step 3: 커밋**

```bash
git add lib/types.ts
git commit -m "[AX-1] refactor: charter content 인터페이스 7개 섹션으로 교체"
```

---

### Task 2: `app/(champion)/charter/page.tsx` — SECTIONS + SectionKey + DOCX export

**Files:**
- Modify: `app/(champion)/charter/page.tsx:28`, `:158-165`, `:265-283`

- [ ] **Step 1: `SectionKey` 타입 교체 (line 28)**

```typescript
// 기존
type SectionKey = 'problem_definition' | 'goal' | 'scope_in' | 'scope_out' | 'expected_outcomes' | 'risks'
```

```typescript
// 변경 후
type SectionKey = 'summary' | 'problem' | 'user' | 'goal' | 'solution' | 'build' | 'timeline'
```

- [ ] **Step 2: `SECTIONS` 배열 교체 (lines 158-165)**

```typescript
// 기존
const SECTIONS: { key: SectionKey; label: string; required?: boolean }[] = [
  { key: 'problem_definition', label: '문제 정의 (AS-IS)', required: true },
  { key: 'goal', label: '목표 (TO-BE)', required: true },
  { key: 'scope_in', label: '범위 In (Scope In)', required: true },
  { key: 'scope_out', label: '범위 Out (Scope Out)', required: true },
  { key: 'expected_outcomes', label: '기대 효과' },
  { key: 'risks', label: '리스크' },
]
```

```typescript
// 변경 후
const SECTIONS: { key: SectionKey; label: string; required?: boolean }[] = [
  { key: 'summary', label: '00. 30-Second Summary', required: true },
  { key: 'problem', label: '01. Problem · 왜 이 문제를 푸는가', required: true },
  { key: 'user', label: '02. User · 누가 이걸 쓸 것인가' },
  { key: 'goal', label: '03. Goal · Success Metric' },
  { key: 'solution', label: '04. Solution · 어떻게 풀 것인가' },
  { key: 'build', label: '05. Build · 어떻게 만들 것인가' },
  { key: 'timeline', label: '06. Timeline · Milestones' },
]
```

- [ ] **Step 3: `handleExport` 함수 교체 (lines 265-283)**

PDF 구조를 반영해 커버 페이지를 추가하고 섹션 번호를 포함한다:

```typescript
// 기존 handleExport (전체 함수 교체)
  async function handleExport() {
    setExporting(true)
    try {
      const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import('docx')
      const { saveAs } = await import('file-saver')
      const src = contentRef.current
      const sections = SECTIONS.map(s => [
        new Paragraph({ text: s.label, heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ children: [new TextRun({ text: stripHtml(src[s.key] ?? ''), break: 1 })] }),
      ]).flat()
      const doc = new Document({
        sections: [{ children: [new Paragraph({ text: projectName || '과제정의서', heading: HeadingLevel.HEADING_1 }), ...sections] }],
      })
      const blob = await Packer.toBlob(doc)
      saveAs(blob, `과제정의서_${projectName || 'charter'}.docx`)
    } finally {
      setExporting(false)
    }
  }
```

```typescript
// 변경 후
  async function handleExport() {
    setExporting(true)
    try {
      const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import('docx')
      const { saveAs } = await import('file-saver')
      const src = contentRef.current
      const today = new Date().toLocaleDateString('ko-KR')

      const coverChildren = [
        new Paragraph({
          children: [new TextRun({ text: 'AX · 과제정의서', size: 18, color: '888888' })],
        }),
        new Paragraph({ text: projectName || '과제정의서', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [new TextRun({ text: `작성일: ${today}`, size: 20, color: '666666' })],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({ text: '' }),
      ]

      const bodyChildren = SECTIONS.flatMap(s => [
        new Paragraph({ text: s.label, heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ children: [new TextRun({ text: stripHtml(src[s.key] ?? '') || '(내용 없음)', size: 22 })] }),
        new Paragraph({ text: '' }),
      ])

      const doc = new Document({
        sections: [{ children: [...coverChildren, ...bodyChildren] }],
      })
      const blob = await Packer.toBlob(doc)
      saveAs(blob, `과제정의서_${projectName || 'charter'}.docx`)
    } finally {
      setExporting(false)
    }
  }
```

- [ ] **Step 4: 빌드 확인**

```bash
npx tsc --noEmit 2>&1 | grep "charter/page"
```

Expected: 출력 없음 (오류 없음).

- [ ] **Step 5: 커밋**

```bash
git add app/\(champion\)/charter/page.tsx
git commit -m "[AX-1] feat: champion charter form 7개 섹션으로 업데이트 + DOCX 커버 추가"
```

---

### Task 3: API 검증 필수 필드 교체

**Files:**
- Modify: `app/api/charter/submissions/route.ts:12`
- Modify: `app/api/charter/submissions/[id]/route.ts:12`

두 파일 모두 `validateCharter` 함수 내 동일한 라인을 수정한다.

- [ ] **Step 1: `submissions/route.ts` 수정**

```typescript
// 기존 (line 12)
  for (const key of ['problem_definition', 'goal', 'scope_in', 'scope_out']) {
```

```typescript
// 변경 후
  for (const key of ['summary', 'problem']) {
```

- [ ] **Step 2: `submissions/[id]/route.ts` 수정**

동일하게:

```typescript
// 기존 (line 12)
  for (const key of ['problem_definition', 'goal', 'scope_in', 'scope_out']) {
```

```typescript
// 변경 후
  for (const key of ['summary', 'problem']) {
```

- [ ] **Step 3: 커밋**

```bash
git add app/api/charter/submissions/route.ts app/api/charter/submissions/\[id\]/route.ts
git commit -m "[AX-1] fix: charter 발행 필수 필드 summary·problem으로 변경"
```

---

### Task 4: `app/admin/progress/page.tsx` — CharterContent 타입 + CHARTER_SECTIONS

**Files:**
- Modify: `app/admin/progress/page.tsx:11-19`, `:31-38`

- [ ] **Step 1: `CharterContent` 타입 교체 (lines 11-19)**

```typescript
// 기존
type CharterContent = {
  problem_definition?: string
  goal?: string
  scope_in?: string
  scope_out?: string
  expected_outcomes?: string
  risks?: string
  [key: string]: string | undefined
}
```

```typescript
// 변경 후
type CharterContent = {
  summary?: string
  problem?: string
  user?: string
  goal?: string
  solution?: string
  build?: string
  timeline?: string
  [key: string]: string | undefined
}
```

- [ ] **Step 2: `CHARTER_SECTIONS` 배열 교체 (lines 31-38)**

```typescript
// 기존
const CHARTER_SECTIONS: { key: string; label: string }[] = [
  { key: 'problem_definition', label: '문제 정의 (AS-IS)' },
  { key: 'goal', label: '목표 (TO-BE)' },
  { key: 'scope_in', label: '범위 In' },
  { key: 'scope_out', label: '범위 Out' },
  { key: 'expected_outcomes', label: '기대 효과' },
  { key: 'risks', label: '리스크' },
]
```

```typescript
// 변경 후
const CHARTER_SECTIONS: { key: string; label: string }[] = [
  { key: 'summary', label: '00. 30-Second Summary' },
  { key: 'problem', label: '01. Problem · 왜 이 문제를 푸는가' },
  { key: 'user', label: '02. User · 누가 이걸 쓸 것인가' },
  { key: 'goal', label: '03. Goal · Success Metric' },
  { key: 'solution', label: '04. Solution · 어떻게 풀 것인가' },
  { key: 'build', label: '05. Build · 어떻게 만들 것인가' },
  { key: 'timeline', label: '06. Timeline · Milestones' },
]
```

- [ ] **Step 3: 전체 타입 오류 없는지 확인**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 출력 없음.

- [ ] **Step 4: 커밋**

```bash
git add app/admin/progress/page.tsx
git commit -m "[AX-1] feat: admin progress view charter 섹션 7개로 업데이트"
```

---

### Task 5: 동작 검증

- [ ] **Step 1: dev server 시작**

```bash
npm run dev
```

- [ ] **Step 2: Champion charter 페이지 확인**

`http://localhost:3000/charter` 접속 → 새 과제정의서 추가 클릭 → 7개 섹션이 올바른 라벨로 표시되는지 확인:
- 00. 30-Second Summary (필수)
- 01. Problem · 왜 이 문제를 푸는가 (필수)
- 02. User · 누가 이걸 쓸 것인가
- 03. Goal · Success Metric
- 04. Solution · 어떻게 풀 것인가
- 05. Build · 어떻게 만들 것인가
- 06. Timeline · Milestones

- [ ] **Step 3: 발행 검증**

`00. 30-Second Summary`와 `01. Problem` 입력 없이 게시 클릭 → "게시 실패: 필수 항목을 확인해주세요" 토스트 표시 확인.

두 섹션 입력 후 게시 → 성공 확인.

- [ ] **Step 4: DOCX 내보내기 검증**

DOCX 버튼 클릭 → 다운로드된 파일 열어서:
1. 커버: "AX · 과제정의서" + 과제명(H1) + 작성일 표시 확인
2. 본문: "00. 30-Second Summary" 등 7개 섹션 순서 확인

- [ ] **Step 5: Admin progress 확인**

`http://localhost:3000/admin/progress` → 과제정의서 카드 클릭 → 사이드 패널에서 7개 섹션 라벨 확인.

- [ ] **Step 6: 최종 커밋**

```bash
git add -A
git status  # 변경된 파일이 없어야 함 (이미 커밋됨)
```
