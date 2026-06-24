# 체크업 세션 UI/UX 배치 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 체크업 세션 UI/UX 10건 개선 — markdown 미팅노트(tiptap+read-only 토글), 세션 시간(HH:mm), 댓글 500 버그 수정, LLM 노트 구조화, drag/drop 업로드, 액션아이템 편집, 마일스톤 tooltip, outlined 버튼, "남은 시간" 제거.

**Architecture:** notes는 markdown TEXT로 통일. read-only는 react-markdown, 편집은 tiptap+tiptap-markdown. LLM 요약은 서버에서 사용자 노트 보존 후 구분선+요약 결합. 세션 시간은 nullable `session_time` 컬럼. 댓글 500은 admin이 public.users에 없어서 생기는 author 조인 오류 → 조인 제거.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, Tailwind+CSS vars, react-markdown(설치됨), remark-gfm(설치됨), tiptap v3(설치됨), tiptap-markdown(신규).

## Global Constraints
- 기계적 구현 모델 하한: Sonnet.
- 변경 후 `bun run typecheck` + `bun run lint`(변경 파일 신규 경고 없음) + `bun run test` 통과.
- notes 저장 포맷은 **markdown 문자열**. read-only 렌더 = react-markdown + remark-gfm.
- AI 요약 구분선 sentinel(정확히): `\n\n---\n\n_🤖 AI 요약_\n\n` — 코드에 상수로 둔다.
- 기존 동시성 가드(expectedUpdatedAt, 처리 락) 깨지 않게 유지.
- CSS는 기존처럼 `style={{ ... var(--token) }}` 패턴 사용.

---

### Task 1: 의존성 + MarkdownView + SessionNotesEditor

**Files:**
- Modify: `package.json` (tiptap-markdown 추가)
- Create: `components/MarkdownView.tsx`
- Create: `components/sessions/SessionNotesEditor.tsx`

**Interfaces (Produces):**
- `MarkdownView({ markdown }: { markdown: string }): JSX` — react-markdown+remark-gfm 렌더(스타일 포함).
- `SessionNotesEditor({ value, onChange }: { value: string; onChange: (md: string) => void }): JSX` — tiptap 에디터, markdown in/out.

- [ ] **Step 1: tiptap-markdown 설치**

Run: `bun add tiptap-markdown` — 설치 후 `bun run typecheck` 통과 확인. **중요:** tiptap v3 호환을 확인하라. `import { Markdown } from 'tiptap-markdown'` 가 동작하고 `editor.storage.markdown.getMarkdown()` 가 존재해야 한다. 만약 v3와 비호환이면 호환 버전을 설치하거나(예: 최신 태그), 비호환이 명백하면 status=BLOCKED로 보고하라(컨트롤러가 대안 결정).

- [ ] **Step 2: `components/MarkdownView.tsx` 작성**

`app/charter-guide/page.tsx`의 ReactMarkdown `components` 스타일 맵을 참고해 재사용 컴포넌트로 만든다. 최소 구현:
```tsx
'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownView({ markdown }: { markdown: string }) {
  if (!markdown?.trim()) {
    return <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>작성된 노트가 없습니다.</p>
  }
  return (
    <div className="text-sm leading-relaxed markdown-body" style={{ color: 'var(--text-primary)' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1.5">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1.5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
          p: ({ children }) => <p className="mb-2">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
          li: ({ children }) => <li className="mb-0.5">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          hr: () => <hr className="my-3" style={{ borderColor: 'var(--border-subtle)' }} />,
          blockquote: ({ children }) => <blockquote className="pl-3 my-2" style={{ borderLeft: '3px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>{children}</blockquote>,
          code: ({ children }) => <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--surface-secondary)' }}>{children}</code>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
```

- [ ] **Step 3: `components/sessions/SessionNotesEditor.tsx` 작성**

`app/(champion)/my-project/charter/SectionEditorInner.tsx`의 tiptap 셋업을 참고하되 markdown I/O로 구성:
```tsx
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { useEffect } from 'react'

export function SessionNotesEditor({ value, onChange }: { value: string; onChange: (md: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.storage.markdown.getMarkdown()),
    editorProps: {
      attributes: {
        class: 'ProseMirror text-sm leading-relaxed focus:outline-none min-h-[160px]',
      },
    },
  })

  // 외부 value가 바뀌면(예: 다른 세션 선택) 에디터 동기화
  useEffect(() => {
    if (editor && value !== editor.storage.markdown.getMarkdown()) {
      editor.commands.setContent(value || '')
    }
  }, [value, editor])

  return (
    <div className="rounded-xl border p-3" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
      <EditorContent editor={editor} />
    </div>
  )
}
```
(StarterKit이 v3에서 `@tiptap/extension-*`를 번들하는지 확인하고, 필요한 경우 charter 에디터처럼 개별 확장을 추가하라.)

- [ ] **Step 4: 검증** — `bun run typecheck && bun run lint` 통과. (단위 테스트는 tiptap/DOM 의존이라 생략; 다음 태스크의 통합으로 검증.)

- [ ] **Step 5: 커밋**
```bash
git add package.json bun.lockb components/MarkdownView.tsx components/sessions/SessionNotesEditor.tsx
git commit -m "[AX-1] feat(sessions): markdown 뷰/에디터 컴포넌트 + tiptap-markdown"
```

---

### Task 2: 미팅노트 read-only/편집 토글 적용 (items 3,5)

**Files:**
- Modify: `components/sessions/AdminSessionDetail.tsx`

**Consumes:** `MarkdownView`, `SessionNotesEditor` (Task 1).

- [ ] **Step 1: import + 상태 추가**

상단 import:
```ts
import { MarkdownView } from '@/components/MarkdownView'
import { SessionNotesEditor } from '@/components/sessions/SessionNotesEditor'
```
상태 추가(다른 useState 근처):
```ts
const [isEditingNotes, setIsEditingNotes] = useState(false)
```

- [ ] **Step 2: 노트 섹션 교체**

기존 노트 블록(설명: `📝 미팅 노트` 헤더 + `<textarea ...notes>`, explore 리포트 기준 lines 266–276)을 다음 구조로 교체:
```tsx
<div className="mb-4">
  <div className="flex items-center justify-between mb-2">
    <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>📝 미팅 노트</p>
    {!isEditingNotes && (
      <button
        onClick={() => setIsEditingNotes(true)}
        className="text-xs font-semibold px-2 py-1 rounded-md"
        style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
      >
        수정
      </button>
    )}
  </div>
  {isEditingNotes ? (
    <SessionNotesEditor value={notes} onChange={setNotes} />
  ) : (
    <div className="rounded-xl border p-3" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
      <MarkdownView markdown={notes} />
    </div>
  )}
</div>
```

- [ ] **Step 3: 저장 버튼을 편집 모드에서만 노출 + 저장 후 read-only 복귀**

기존 저장 버튼 블록(explore 리포트 lines 417–425)을 `{isEditingNotes && (...)}` 로 감싸고, `saveNotes` 성공 시 `setIsEditingNotes(false)`를 추가한다. `saveNotes`의 try 성공 경로 끝(`toast.success('저장되었습니다.')` 다음)에 `setIsEditingNotes(false)` 추가. 버튼 텍스트는 그대로 `{saving ? '저장 중...' : '저장'}`. 취소 버튼도 추가:
```tsx
{isEditingNotes && (
  <div className="flex gap-2">
    <button
      onClick={() => { setIsEditingNotes(false); setNotes(session?.notes ?? '') }}
      className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
      style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
    >취소</button>
    <button
      onClick={saveNotes}
      disabled={saving}
      className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
      style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
    >{saving ? '저장 중...' : '저장'}</button>
  </div>
)}
```

- [ ] **Step 4: 검증** — `bun run typecheck && bun run lint && bun run test` 통과.

- [ ] **Step 5: 커밋**
```bash
git add components/sessions/AdminSessionDetail.tsx
git commit -m "[AX-1] feat(sessions): 미팅노트 markdown read-only/편집 토글 + 수정 버튼"
```

---

### Task 3: LLM 노트 구조 (서버, 기존 노트 보존) (item 8)

**Files:**
- Modify: `lib/sessions/processAudio.ts`

- [ ] **Step 1: 구분선 상수 + 결합 로직**

`processAudio.ts` 상단에 상수 추가:
```ts
export const AI_DIVIDER = '\n\n---\n\n_🤖 AI 요약_\n\n'
```
요약 저장부에서 기존 코드가 `notes`(LLM 요약)를 그대로 저장하던 것을, "기존 사용자 노트 보존 + 구분선 + LLM"으로 변경한다. Claude 요약 파싱 후 DB 저장 직전에:
```ts
// 기존 사용자 수기 노트 보존: 이전 AI 구분선 앞부분만 유지(재처리 시 중첩 방지)
const { data: prev } = await supabase
  .from('check_up_sessions')
  .select('notes')
  .eq('id', sessionId)
  .single()
const userPart = (prev?.notes ?? '').split(AI_DIVIDER)[0].trimEnd()
const combinedNotes = userPart ? `${userPart}${AI_DIVIDER}${notes}` : notes
```
그리고 `processing_status='done'` 업데이트 및 반환에서 `notes` 대신 `combinedNotes`를 저장/반환한다. (해당 update의 `notes: notes` → `notes: combinedNotes`, 반환 객체 `notes: combinedNotes`, 클라이언트가 받는 값도 결합본.)

- [ ] **Step 2: 검증** — `bun run typecheck && bun run test` 통과. (기존 lib/sessions 테스트 깨지지 않는지 확인.)

- [ ] **Step 3: 커밋**
```bash
git add lib/sessions/processAudio.ts
git commit -m "[AX-1] feat(sessions): AI 요약 시 사용자 노트 보존 + 구분선 결합"
```

---

### Task 4: 세션 시간 HH:mm (item 10)

**Files:**
- Create: `supabase/migrations/20260624100000_add_session_time.sql`
- Modify: `app/api/sessions/route.ts` (POST), `components/sessions/AdminSessionList.tsx`, `components/sessions/AdminSessionDetail.tsx`, `lib/types.ts`

- [ ] **Step 1: 마이그레이션**
```sql
-- 체크업 세션 시작 시각(HH:mm) 추가
ALTER TABLE check_up_sessions ADD COLUMN session_time TIME;
```

- [ ] **Step 2: 타입 추가** — `lib/types.ts`의 `CheckUpSession`에 `session_time: string | null` 추가(`session_date` 아래).

- [ ] **Step 3: POST 핸들러** — `app/api/sessions/route.ts` POST에서 body의 `session_time`(선택, 'HH:mm' 문자열)을 받아 insert에 포함:
```ts
const { champion_user_id, session_date, session_time, title } = await req.json()
// ... insert object에 추가:
...(session_time ? { session_time } : {}),
```

- [ ] **Step 4: 생성 폼** — `AdminSessionList.tsx`에 시간 상태 + 입력 추가:
```ts
const [newTime, setNewTime] = useState('')
```
DatePicker 아래에 `<input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="..." style={{ ...기존 입력과 동일 토큰 }} />` 추가. POST body에 `session_time: newTime || undefined` 추가. 생성 후 `setNewTime('')`.

- [ ] **Step 5: 표시** — 목록(`AdminSessionList.tsx` 날짜 표시부)과 상세(`AdminSessionDetail.tsx` 날짜 표시부)에서 `{s.session_date}{s.session_time ? ` ${s.session_time.slice(0,5)}` : ''}` 형태로 `HH:mm` 함께 표시.

- [ ] **Step 6: 검증** — `bun run typecheck && bun run lint && bun run test`.

- [ ] **Step 7: 커밋**
```bash
git add supabase/migrations/20260624100000_add_session_time.sql app/api/sessions/route.ts components/sessions/AdminSessionList.tsx components/sessions/AdminSessionDetail.tsx lib/types.ts
git commit -m "[AX-1] feat(sessions): 세션 시간(HH:mm) 추가"
```

> **운영:** 마이그레이션을 Supabase에 적용해야 함(별도 실행).

---

### Task 5: 댓글 500 버그 수정 (item 2)

**Files:**
- Modify: `app/api/sessions/[sessionId]/comments/route.ts` (POST)

근본 원인: POST의 `.select('*, author:users(id,name,email)')` 가 `public.users`에 없는 admin author를 조인하려다 `.single()`에서 실패→500.

- [ ] **Step 1: 조인 제거**

POST insert의 `.select('*, author:users(id,name,email)')` 를 `.select('*')` 로 변경. (반환 row 형태는 author 없이 반환되며, UI는 `author_role`로 표시 이름을 fallback 처리하므로 영향 없음.) GET의 조인은 champion(=public.users 존재) author 표시를 위해 유지하되, admin author는 null로 와도 UI fallback이 처리함 — GET은 변경하지 않는다.

- [ ] **Step 2: 검증** — `bun run typecheck`. (가능하면 로컬에서 admin으로 댓글 POST가 201 반환하는지 수동 확인 권장.)

- [ ] **Step 3: 커밋**
```bash
git add app/api/sessions/[sessionId]/comments/route.ts
git commit -m "[AX-1] fix(sessions): 댓글 작성 500 수정 (public.users author 조인 제거)"
```

---

### Task 6: 소규모 UI 항목 (items 4, 6, 7, 9 + 남은시간 제거)

**Files:**
- Modify: `components/sessions/RecordingPanel.tsx` (남은시간 제거 + drag/drop)
- Modify: `components/sessions/AdminSessionDetail.tsx` (액션아이템 인라인 편집)
- Modify: `app/admin/champions/[userId]/page.tsx` (과제정의서 outlined 버튼 + MilestoneRow tooltip)

- [ ] **Step 1: "남은 시간" 제거 (RecordingPanel)**

`remainingSec` 관련 전부 제거: state 선언(`const [remainingSec, ...]`), `startProgressTimer` 내 `setRemainingSec` 계산 블록, 처리 완료/`reset()`의 `setRemainingSec(null)`, 그리고 `isProcessing` UI 내 "남은 시간 / 거의 완료 중..." 렌더 ternary. `progressStartRef`가 remainingSec 계산에만 쓰였다면 함께 제거. 제거 후 진행률 바/퍼센트는 유지.

- [ ] **Step 2: drag/drop 업로드 (RecordingPanel)**

업로드 모드(`mode === 'upload'`)의 파일 선택 영역을 드롭존으로 감싼다. 새 상태 `const [dragOver, setDragOver] = useState(false)`. 래퍼 div에:
```tsx
<div
  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
  onDragLeave={() => setDragOver(false)}
  onDrop={e => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileFromDrop(file)
  }}
  className="rounded-xl border-2 border-dashed p-6 text-center"
  style={{ borderColor: dragOver ? 'var(--blue-600)' : 'var(--border-subtle)', background: dragOver ? 'var(--surface-secondary)' : 'transparent' }}
>
  {/* 기존 파일 선택 버튼 + 안내문 + "또는 파일을 여기로 드래그" 문구 */}
</div>
```
`handleFileSelected`의 파일 검증/처리 로직을 `handleFileFromDrop(file: File)`로 추출해 input/onChange와 드롭이 공유하게 한다(검증 실패 toast + `uploadAndProcess` 호출). 기존 `<input type="file" hidden>` + "파일 선택" 버튼은 드롭존 내부에 유지.

- [ ] **Step 3: 액션아이템 인라인 편집 (AdminSessionDetail)**

액션아이템 렌더에 편집 상태 추가: `const [editingItemId, setEditingItemId] = useState<string|null>(null)` + `const [editingItemBody, setEditingItemBody] = useState('')`. 각 항목의 `<span>{item.body}</span>` 옆에 "수정" 버튼; 클릭 시 input으로 전환. 저장 함수:
```ts
async function saveItemBody(itemId: string) {
  const updated = await apiFetch<SessionActionItem>(`/api/sessions/${sessionId}/action-items/${itemId}`, {
    method: 'PATCH', body: JSON.stringify({ body: editingItemBody.trim() }),
  })
  setActionItems(v => v.map(i => i.id === itemId ? updated : i))
  setEditingItemId(null)
}
```
(API PATCH는 admin의 `body` 수정을 이미 지원.) 편집 중 항목은 `<input>` + 저장/취소, 아니면 기존 `<span>` + 수정/삭제.

- [ ] **Step 4: 과제정의서 보기 outlined 버튼 (champion page)**

explore 리포트 기준 버튼 style을 outlined로 교체:
```tsx
style={{ background: 'transparent', border: '1px solid var(--blue-600)', color: 'var(--blue-600)', cursor: 'pointer', padding: '4px 12px', borderRadius: 6, fontWeight: 600 }}
```
(`textDecoration: 'underline'`, `padding:'0'` 제거.)

- [ ] **Step 5: 마일스톤 이름 tooltip (champion page MilestoneRow)**

admin 상세의 `MilestoneRow` 마일스톤 이름 요소(truncate, title 없음)에 `title={m.title}`(또는 해당 이름 변수) 추가해 hover 시 전체 이름 표시. (`SessionMiniGantt`는 이미 title 있음 — 변경 불필요.)

- [ ] **Step 6: 검증** — `bun run typecheck && bun run lint && bun run test`.

- [ ] **Step 7: 커밋** (논리 단위로 나눠 커밋 권장)
```bash
git add components/sessions/RecordingPanel.tsx
git commit -m "[AX-1] feat(sessions): 업로드 drag/drop + 처리 중 '남은 시간' 제거"
git add components/sessions/AdminSessionDetail.tsx
git commit -m "[AX-1] feat(sessions): 액션아이템 텍스트 인라인 편집"
git add 'app/admin/champions/[userId]/page.tsx'
git commit -m "[AX-1] feat(admin): 과제정의서 outlined 버튼 + 마일스톤 이름 tooltip"
```

---

## Self-review 메모
- tiptap-markdown v3 호환은 Task 1 Step 1에서 반드시 확인(비호환 시 BLOCKED 보고).
- notes 포맷이 plain text → markdown으로 전환되므로 기존 plain text notes도 react-markdown이 그대로 렌더(평문은 문단으로 표시) — 데이터 마이그레이션 불필요.
- 모든 변경은 기존 동시성 가드(expectedUpdatedAt/처리 락)와 독립.
