# UI/UX Polish (shadcn/ui 도입 + 4개 묶음) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** shadcn/ui + Radix 도입으로 common UI primitive 생성 + 17개 UX 이슈 중 A/B/C/D 4개 묶음을 챔피언+어드민 양쪽에 일관 적용한다.

**Architecture:** 새 브랜치 `feature/ui-polish`에서 작업. Phase 1(인프라) → Phase 2(컴포넌트) → Phase 3(4 묶음 적용) → Phase 4(폴리시). 기존 inline-style + CSS variable은 페이지에 유지, 신규 shadcn 컴포넌트만 Tailwind 클래스 사용.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, shadcn/ui (new-york), Radix UI, Sonner, Lucide Icons, TypeScript

---

## 진행 규칙 (모든 task 공통)

### 브랜치
모든 작업은 `feature/ui-polish`에서 진행. Task 1 시작 시 main에서 분기.

### Obsidian 문서화 (각 task commit 후 필수)

각 task commit 직후 `/Users/claud_01/Documents/flo/_obsidian/Daily Notes/2026-05-18.md`에 다음 블록을 append (적절한 위치 — UI polish 섹션 아래 번호 매기며):

```markdown
### N. <enhancement 짧은 이름>
**Problem:** <무엇이 잘못됐는지, 가능하면 file:line>
**Solution:** <무엇을 했는지 + 커밋 SHA>
**TIL:** <재사용 가능한 교훈 or "n/a">
```

Task별로 1-3개의 enhancement 블록을 추가 (task가 여러 페이지에 같은 패턴 적용이면 묶어서 1블록도 OK).

### kanban DnD confirm: 적용하지 않음

(결정 사항: drop 흐름의 부드러움 우선)

---

## 변경/추가 파일 목록 (전체)

### 신규
| 파일 | 역할 |
|------|------|
| `components.json` | shadcn 설정 |
| `lib/utils.ts` | `cn()` helper |
| `components/ui/sonner.tsx` | Toast UI provider |
| `components/ui/dialog.tsx` | Modal primitive |
| `components/ui/alert-dialog.tsx` | Confirm primitive |
| `components/ui/skeleton.tsx` | 로딩 placeholder |
| `components/ui/spinner.tsx` | 자체 Spinner |
| `components/ui/empty-state.tsx` | 자체 EmptyState |

### 수정
| 파일 | 변경 요약 |
|------|----------|
| `package.json` / lock | shadcn 의존성 추가 (자동) |
| `tailwind.config.ts` 또는 `.js` | shadcn 토큰 추가 |
| `app/globals.css` | shadcn variables 추가 (기존 보존) |
| `app/layout.tsx` | `<Toaster />` 추가 |
| `app/(champion)/page.tsx` | toast + skeleton + EmptyState |
| `app/(champion)/homework/[id]/page.tsx` | toast + Dialog + Ctrl+Enter |
| `app/(champion)/charter/page.tsx` | toast + DOCX 로딩 + unsaved 경고 + EmptyState |
| `app/(champion)/milestones/page.tsx` | toast + Dialog x3 + AlertDialog + 성공 toast + EmptyState |
| `app/admin/kanban/page.tsx` | 기존 toast → sonner |
| `app/admin/requests/page.tsx` | toast + AlertDialog + EmptyState |
| `app/admin/progress/page.tsx` | toast + hex→var (Phase 4) |
| `app/admin/homework/[id]/page.tsx` | toast + Spinner |
| `app/admin/homework/[id]/[userId]/page.tsx` | toast + Spinner |
| `app/(champion)/layout.tsx` / `app/admin/layout.tsx` | nav aria-label (Phase 4) |

---

## Task 1: 새 브랜치 생성 + shadcn/ui init

**Files:**
- Create: `components.json`, `lib/utils.ts`
- Modify: `app/globals.css`, `tailwind.config.{ts,js}`, `package.json`/lock

- [ ] **Step 1: main에서 새 브랜치 생성**

  ```bash
  cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
  git checkout main
  git checkout -b feature/ui-polish
  ```

  Expected: `Switched to a new branch 'feature/ui-polish'`

- [ ] **Step 2: shadcn init 실행**

  ```bash
  npx shadcn@latest init
  ```

  대화형 질문 답변:
  - Which style would you like to use? → **New York**
  - Which color would you like to use as the base color? → **Slate**
  - Would you like to use CSS variables for theming? → **Yes**

  Expected: `components.json` 생성, `lib/utils.ts` 생성, `tailwind.config` 수정, `globals.css` 수정. 의존성 자동 설치(`tailwindcss-animate`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`).

- [ ] **Step 3: globals.css 변경 확인 — 기존 변수 보존 검증**

  ```bash
  grep -E '\-\-text-primary|\-\-blue-600|\-\-amber|\-\-success|\-\-error|\-\-border-subtle' app/globals.css
  ```

  Expected: 모든 기존 변수가 여전히 출력됨. 만약 누락됐다면 `git diff app/globals.css`를 확인하고 누락된 라인을 복원.

- [ ] **Step 4: TypeScript 컴파일 + lint 확인**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  npm run lint 2>&1 | head -20
  ```

  Expected: 새 오류 없음.

- [ ] **Step 5: Commit**

  ```bash
  git add components.json lib/utils.ts app/globals.css tailwind.config.ts tailwind.config.js package.json package-lock.json 2>/dev/null
  git commit -m "chore(ui): shadcn/ui 초기 셋업 (new-york style, slate)"
  ```

  파일이 .ts인지 .js인지 환경에 따라 다를 수 있음 — 둘 다 add 시도, 없는 건 무시됨.

- [ ] **Step 6: Obsidian 기록 — Daily note에 UI polish 섹션 시작 + 첫 enhancement 추가**

  `/Users/claud_01/Documents/flo/_obsidian/Daily Notes/2026-05-18.md` 끝에 다음 추가:

  ```markdown

  ---

  ## UI/UX Polish 진행 (feature/ui-polish 브랜치)

  ### 1. shadcn/ui 인프라 도입
  **Problem:** common UI primitive 부재 — modal/toast/confirm 패턴이 페이지마다 다르게 ad-hoc로 구현됨 (kanban만 toast 있음, 모든 modal에 Esc-close 없음, admin 액션에 confirm 없음 등). 신규 컴포넌트 추가 시 매번 재발명.
  **Solution:** shadcn/ui (new-york + slate) init. `components.json`, `lib/utils.ts (cn helper)`, `tailwind.config`, `app/globals.css`(shadcn semantic 변수 추가, 기존 디자인 토큰 보존). 의존성 자동 설치 (Radix, class-variance-authority, lucide-react). 커밋 <SHA>.
  **TIL:** shadcn은 페이지를 직접 변경하지 않고 `components/ui/*` 디렉토리에 독립 컴포넌트만 추가. 기존 inline-style + CSS var 패턴과 공존 가능 (Tailwind class 기반 신규 컴포넌트만 새 영역으로).
  ```

  `<SHA>`는 Step 5의 commit SHA로 교체.

---

## Task 2: shadcn 컴포넌트 4개 설치 + 자체 컴포넌트 2개 작성

**Files:**
- Create: `components/ui/sonner.tsx`, `components/ui/dialog.tsx`, `components/ui/alert-dialog.tsx`, `components/ui/skeleton.tsx` (auto-generated)
- Create: `components/ui/spinner.tsx`, `components/ui/empty-state.tsx` (manual)

- [ ] **Step 1: shadcn 컴포넌트 4개 설치**

  ```bash
  npx shadcn@latest add sonner dialog alert-dialog skeleton
  ```

  Expected: 4개 `components/ui/*.tsx` 파일 생성. Radix 관련 패키지 추가 설치 (`@radix-ui/react-dialog`, `@radix-ui/react-alert-dialog`, `sonner`).

- [ ] **Step 2: `components/ui/spinner.tsx` 작성**

  ```tsx
  import { Loader2 } from 'lucide-react'
  import { cn } from '@/lib/utils'

  interface SpinnerProps {
    size?: 'sm' | 'md' | 'lg'
    className?: string
  }

  const SIZE_CLASS: Record<NonNullable<SpinnerProps['size']>, string> = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }

  export function Spinner({ size = 'md', className }: SpinnerProps) {
    return (
      <Loader2
        className={cn('animate-spin text-muted-foreground', SIZE_CLASS[size], className)}
        aria-label="로딩 중"
      />
    )
  }

  export function FullPageSpinner() {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Spinner size="lg" />
      </div>
    )
  }
  ```

- [ ] **Step 3: `components/ui/empty-state.tsx` 작성**

  ```tsx
  import type { LucideIcon } from 'lucide-react'
  import { cn } from '@/lib/utils'

  interface EmptyStateProps {
    icon?: LucideIcon
    title: string
    description?: string
    action?: React.ReactNode
    className?: string
  }

  export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
        {Icon && <Icon className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />}
        <p className="text-base font-semibold text-foreground mb-1">{title}</p>
        {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
        {action}
      </div>
    )
  }
  ```

- [ ] **Step 4: TypeScript 컴파일 확인**

  ```bash
  cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: 오류 없음.

- [ ] **Step 5: Commit**

  ```bash
  git add components/ui/ package.json package-lock.json
  git commit -m "feat(ui): shadcn primitive 4개 + Spinner/EmptyState 추가"
  ```

- [ ] **Step 6: Obsidian append**

  Daily note에 추가:

  ```markdown

  ### 2. Common UI 컴포넌트 추가
  **Problem:** 로딩/빈상태/모달 등 공통 UI 패턴이 각 페이지에 inline-style + ad-hoc div로 흩어져 재사용 불가.
  **Solution:** shadcn 컴포넌트 4개(`sonner`, `dialog`, `alert-dialog`, `skeleton`) 추가 + 자체 `Spinner`(Lucide Loader2 + animate-spin) + `EmptyState`(아이콘+제목+설명+action) 컴포넌트 작성. `components/ui/` 디렉토리에 모음. 커밋 <SHA>.
  **TIL:** Radix Dialog는 Esc-close, focus trap, role=dialog, aria-modal을 자동 처리 — 직접 구현하면 빠뜨리기 쉬운 a11y 표준을 무료로 얻음. Sonner는 `position` + `richColors` prop으로 톤 조정 가능.
  ```

---

## Task 3: Toast 전역 설정 + Bundle A (챔피언 페이지)

**Files:**
- Modify: `app/layout.tsx`, `app/(champion)/page.tsx`, `app/(champion)/homework/[id]/page.tsx`, `app/(champion)/charter/page.tsx`, `app/(champion)/milestones/page.tsx`

- [ ] **Step 1: Root layout에 `<Toaster />` 추가**

  `app/layout.tsx`에서 기존 `body` 내부 마지막에 추가:

  ```tsx
  import { Toaster } from '@/components/ui/sonner'
  // ... existing imports

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="ko">
        <body>
          {children}
          <Toaster position="top-right" richColors />
        </body>
      </html>
    )
  }
  ```

  > 주의: 기존 `body`에 다른 attribute가 있으면 보존.

- [ ] **Step 2: 챔피언 페이지의 silent failure / alert를 `toast.error`로 교체**

  대상 파일 각각에 `import { toast } from 'sonner'` 추가 후, 모든 fetch/mutation `.catch()`를 `toast.error()`로 통일:

  ```ts
  // Before
  apiFetch(url).then(setData)
  // 또는 .catch(() => alert('실패'))

  // After
  apiFetch(url).then(setData).catch((e: Error) => toast.error('데이터 로드 실패: ' + e.message))
  ```

  - `app/(champion)/page.tsx`: `useEffect`의 `apiFetch<Homework[]>(...)` 등
  - `app/(champion)/homework/[id]/page.tsx`: submission/comment/charter/milestone CRUD
  - `app/(champion)/charter/page.tsx`: charter 저장/조회
  - `app/(champion)/milestones/page.tsx`: milestone CRUD/deliverable 업로드/deadline request

  핵심 패턴: 모든 `apiFetch(...)` 호출에 `.catch((e: Error) => toast.error(...))` 추가. 이미 try/catch로 처리하던 곳도 alert/silent 대신 toast 사용.

- [ ] **Step 3: TypeScript 컴파일 확인**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 4: 브라우저 수동 검증 (개발 서버 실행 중인 경우)**

  네트워크 탭에서 임의 API를 fail시켜(예: 임시 endpoint 변경) toast가 우상단에 표시되는지 확인.

- [ ] **Step 5: Commit**

  ```bash
  git add app/layout.tsx app/\(champion\)/
  git commit -m "feat(ui): 챔피언 페이지 toast 통일 + Toaster 전역 마운트"
  ```

- [ ] **Step 6: Obsidian append**

  ```markdown

  ### 3. 챔피언 페이지 에러 toast 통일
  **Problem:** 챔피언 페이지의 API 실패가 silent였음 (`apiFetch().then().catch` 누락 또는 alert 사용). 사용자가 무엇이 실패했는지 모름. 예: `app/(champion)/page.tsx` 홈 fetch 시 에러 발생 시 빈 화면.
  **Solution:** root layout에 `<Toaster position="top-right" richColors />` 추가. 모든 챔피언 페이지(`page.tsx`, `homework/[id]/page.tsx`, `charter/page.tsx`, `milestones/page.tsx`)의 async 핸들러에 `toast.error('...')` 추가. 커밋 <SHA>.
  **TIL:** Sonner는 RootLayout에 1회만 마운트 + 어디서든 `import { toast } from 'sonner'` 후 호출. `richColors` prop으로 success/error 별 색상 자동 적용.
  ```

---

## Task 4: Bundle A — 어드민 페이지 toast + kanban 마이그레이션

**Files:**
- Modify: `app/admin/kanban/page.tsx`, `app/admin/requests/page.tsx`, `app/admin/progress/page.tsx`, `app/admin/homework/[id]/page.tsx`, `app/admin/homework/[id]/[userId]/page.tsx`

- [ ] **Step 1: kanban의 기존 local toast를 sonner로 교체**

  `app/admin/kanban/page.tsx`:
  - 기존 `useState<string|null>(toast)` + `showToast` 함수 + JSX의 toast div 모두 제거
  - 위치: `setToast(msg); setTimeout(...)` 패턴이 보이는 부분
  - 대신:
    ```ts
    import { toast } from 'sonner'

    function showToast(msg: string) { toast.error(msg) }
    ```
  - 또는 `showToast(...)` 콜사이트를 직접 `toast.error(...)`로 교체

- [ ] **Step 2: 나머지 어드민 페이지에 toast 추가**

  각 파일에 `import { toast } from 'sonner'` + 기존 silent failure 또는 alert 위치에 `toast.error()`/`toast.success()` 추가:

  - `app/admin/requests/page.tsx`: `handleReview`에 try/catch + toast (현재 catch 없음)
  - `app/admin/progress/page.tsx`: 데이터 fetch 실패 toast
  - `app/admin/homework/[id]/page.tsx`: CRUD 실패 toast
  - `app/admin/homework/[id]/[userId]/page.tsx`: 상태 변경 실패 toast

- [ ] **Step 3: TypeScript 컴파일 확인**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add app/admin/
  git commit -m "feat(ui): 어드민 페이지 toast 통일 + kanban 로컬 toast 제거"
  ```

- [ ] **Step 5: Obsidian append**

  ```markdown

  ### 4. 어드민 페이지 toast 통일 + kanban 로컬 toast 제거
  **Problem:** kanban만 자체 useState 기반 toast가 있고, 나머지 어드민 페이지(`requests`, `progress`, `homework/[id]`, `[userId]`)는 모두 silent failure. `admin/requests/page.tsx`의 `handleReview`는 try/catch 자체가 없어 API 에러 발생 시 UI에 흔적 없음.
  **Solution:** kanban의 local `toast` state/JSX 제거 후 sonner로 통일. 모든 어드민 페이지에 `import { toast } from 'sonner'` + `.catch(toast.error)` 패턴 적용. 커밋 <SHA>.
  **TIL:** 중복 toast 인프라(local + global) 공존 시 사용자에게 두 종류의 알림 스타일이 보여 혼란 — 통일은 한 번에 끝내는 것이 유리.
  ```

---

## Task 5: Bundle A 마지막 — Charter 에디터 unsaved-changes 경고

**Files:**
- Modify: `app/(champion)/charter/page.tsx`

- [ ] **Step 1: CharterPanel의 dirty 상태 추적**

  TipTap onChange 콜백에서 `dirtyRef.current = true` 설정. 저장 성공 시 `dirtyRef.current = false`로 리셋. ref(`useRef<boolean>(false)`)를 컴포넌트 최상위에 선언.

- [ ] **Step 2: onClose에서 dirty 체크 → AlertDialog 표시**

  `import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'`

  - `showUnsavedDialog: useState<boolean>(false)` 추가
  - `handleClose` 함수에서 dirty이면 `setShowUnsavedDialog(true)`, 아니면 기존 close 로직 호출
  - AlertDialog 마운트:
    ```tsx
    <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>저장하지 않은 변경사항이 있습니다</AlertDialogTitle>
          <AlertDialogDescription>닫으면 변경사항이 사라집니다. 정말 닫으시겠습니까?</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>계속 편집</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setShowUnsavedDialog(false); originalClose() }}>닫기</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    ```

- [ ] **Step 3: TypeScript 컴파일 확인**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add app/\(champion\)/charter/page.tsx
  git commit -m "feat(ui): charter 에디터 unsaved-changes 경고 다이얼로그"
  ```

- [ ] **Step 5: Obsidian append**

  ```markdown

  ### 5. Charter 에디터 unsaved-changes 경고
  **Problem:** `app/(champion)/charter/page.tsx`의 CharterPanel은 TipTap 변경사항을 `contentRef`에 누적하지만, ✕ 클릭 시 즉시 close — 저장 안 한 변경사항이 silent하게 사라짐.
  **Solution:** `dirtyRef` 추가 (TipTap onChange에서 true 설정, save 후 false). `handleClose`에서 dirty이면 AlertDialog로 "저장하지 않은 변경사항이 있습니다" 경고. 사용자가 "계속 편집" 또는 "닫기" 선택. 커밋 <SHA>.
  **TIL:** TipTap 같은 controlled-uncontrolled 하이브리드 에디터는 onChange 콜백으로 dirty 감지가 가장 신뢰성 있음 (controlled state 비교 시 cursor jump 등 부작용).
  ```

---

## Task 6: Bundle B — 모든 modal을 shadcn Dialog로 교체 + Ctrl+Enter

**Files:**
- Modify: `app/(champion)/milestones/page.tsx`, `app/(champion)/homework/[id]/page.tsx`, `components/CharterCommentPanel.tsx` (존재 시)

- [ ] **Step 1: milestones 페이지의 3개 modal Dialog로 교체**

  `app/(champion)/milestones/page.tsx`의 resubmit modal, edit modal, deadline-request modal — 각각 다음 패턴으로:

  ```tsx
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'

  // Before: <div onClick={onClose} style={...backdrop}>...</div>
  // After:
  <Dialog open={isOpen} onOpenChange={setIsOpen}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>...</DialogTitle>
        <DialogDescription>...</DialogDescription>
      </DialogHeader>
      {/* form content */}
      <DialogFooter>
        <button onClick={...}>저장</button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  ```

  Dialog는 자동으로: Esc-close, backdrop click close, focus trap, role=dialog, aria-modal, fade animation.

- [ ] **Step 2: homework/[id] 페이지의 milestone edit modal 같은 패턴으로 교체**

  `app/(champion)/homework/[id]/page.tsx`의 milestone edit modal.

- [ ] **Step 3: Comment/Reply textarea에 Ctrl+Enter submit 단축키**

  `app/(champion)/homework/[id]/page.tsx`의 submission comment textarea와 `components/CharterCommentPanel.tsx`(존재 시)의 textarea에 onKeyDown 핸들러:

  ```tsx
  <textarea
    value={comment}
    onChange={e => setComment(e.target.value)}
    onKeyDown={e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmitComment()
      }
    }}
  />
  ```

- [ ] **Step 4: TypeScript 컴파일 + 시각 확인**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  dev 서버에서 modal 열기 → Esc 키, backdrop 클릭, Tab focus order 검증.

- [ ] **Step 5: Commit**

  ```bash
  git add app/\(champion\)/milestones/page.tsx app/\(champion\)/homework/\[id\]/page.tsx components/CharterCommentPanel.tsx 2>/dev/null
  git commit -m "feat(ui): modal → shadcn Dialog 교체 + Ctrl+Enter 코멘트 단축키"
  ```

- [ ] **Step 6: Obsidian append**

  ```markdown

  ### 6. Modal UX 표준화 (Dialog + Ctrl+Enter)
  **Problem:** 챔피언 페이지의 4개 modal(`milestones/page.tsx` 3개 + `homework/[id]/page.tsx` 1개) 모두 수동 `<div>` 백드롭 + 닫기 버튼만. Esc-close 없음, focus trap 없음, role=dialog 없음, aria-modal 없음. 코멘트 textarea에 키보드 단축키 없음.
  **Solution:** 모든 modal을 shadcn `Dialog` 컴포넌트로 교체 → Radix가 a11y 표준 자동 처리. 코멘트 textarea에 `onKeyDown`으로 Ctrl/Cmd+Enter submit. 커밋 <SHA>.
  **TIL:** Radix `Dialog`는 `open`/`onOpenChange` 두 prop만으로 controlled — useState로 open 상태 관리. Trigger를 별도로 두지 않고 외부에서 prop으로 제어하면 기존 트리거 버튼 위치를 안 옮겨도 됨.
  ```

---

## Task 7: Bundle C — AlertDialog (어드민 confirm) + 성공 toast

**Files:**
- Modify: `app/admin/requests/page.tsx`, `app/(champion)/milestones/page.tsx`, `app/(champion)/homework/[id]/page.tsx`, `app/(champion)/charter/page.tsx`

- [ ] **Step 1: admin/requests/page.tsx — 승인/반려에 AlertDialog confirm 추가**

  현재 ✓ 승인 / ✗ 반려 버튼 클릭 시 즉시 실행됨. AlertDialog로 한 번 더 확인:

  ```tsx
  import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

  <AlertDialog>
    <AlertDialogTrigger asChild>
      <button>✓ 승인</button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>기한변경 요청 승인</AlertDialogTitle>
        <AlertDialogDescription>마일스톤 마감일이 요청 날짜로 변경됩니다. 진행하시겠습니까?</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>취소</AlertDialogCancel>
        <AlertDialogAction onClick={() => handleReview('approved')}>승인</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  ```

  반려 버튼도 동일 패턴 (제목/설명만 다름).

- [ ] **Step 2: 챔피언 milestone 삭제에 AlertDialog 적용**

  `app/(champion)/milestones/page.tsx` + `app/(champion)/homework/[id]/page.tsx`의 마일스톤 삭제 — 현재 2단계 버튼("삭제" → "정말 삭제") 패턴이 있다면 AlertDialog로 교체.

- [ ] **Step 3: 성공 toast 추가**

  명시적 액션이 성공했을 때 `toast.success('...')`:
  - `app/(champion)/milestones/page.tsx` `handleUpload` (deliverable 업로드) → `toast.success('파일이 업로드되었습니다.')`
  - `app/(champion)/charter/page.tsx` 저장 성공 → `toast.success('과제정의서가 저장되었습니다.')`
  - `app/(champion)/milestones/page.tsx` milestone CRUD 성공
  - `app/(champion)/milestones/page.tsx` deadline request 성공 (기존 success 메시지가 inline이면 toast로 통일)

- [ ] **Step 4: TypeScript 컴파일 확인**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add app/admin/requests/page.tsx app/\(champion\)/
  git commit -m "feat(ui): AlertDialog 어드민 confirm + 성공 toast 통일"
  ```

- [ ] **Step 6: Obsidian append**

  ```markdown

  ### 7. ConfirmDialog + 성공 피드백
  **Problem:** admin 승인/반려가 클릭 즉시 실행되어 실수 위험 (`admin/requests/page.tsx`). 챔피언 파일 업로드/저장 후 성공 피드백 없음 — 변경됐는지 사용자가 모름.
  **Solution:** 모든 destructive/중요 액션에 `AlertDialog` confirm 추가 (승인/반려/마일스톤 삭제). 명시적 액션 성공 시 `toast.success(...)` 호출 (파일 업로드/저장/CRUD). 커밋 <SHA>.
  **TIL:** `AlertDialog`는 `AlertDialogTrigger asChild`로 기존 버튼을 그대로 감쌀 수 있어 마크업 변경 최소화. confirm의 비용/혜택: drag-drop 같은 빠른 흐름에는 confirm을 빼고, 키보드/마우스 1-click 액션에만 적용하는 게 적절.
  ```

---

## Task 8: Bundle D — Spinner / Skeleton / EmptyState 통일

**Files:**
- Modify: 챔피언 + 어드민 페이지 거의 전부

- [ ] **Step 1: 모든 `<p>로딩 중...</p>` → `<FullPageSpinner />` 교체**

  검색:
  ```bash
  grep -rn "로딩 중" app/ --include="*.tsx"
  ```

  각 사이트에 `import { FullPageSpinner } from '@/components/ui/spinner'` 후 텍스트를 컴포넌트로 교체.

  대상: `app/admin/homework/[id]/page.tsx`, `app/admin/homework/[id]/[userId]/page.tsx`, `app/(champion)/homework/[id]/page.tsx`, 기타 발견되는 모든 곳.

- [ ] **Step 2: 챔피언 홈에 Skeleton 카드 추가**

  `app/(champion)/page.tsx`:
  - `loading: boolean` state 추가 (초기값 true, fetch 완료/실패 시 false)
  - homeworks 배열이 로드되기 전(`loading === true`)에는 Skeleton 카드 N개 표시
  - 로드 완료 후 실제 카드 표시

  ```tsx
  import { Skeleton } from '@/components/ui/skeleton'

  {loading ? (
    Array.from({ length: 4 }).map((_, i) => (
      <Skeleton key={i} className="h-24 w-full rounded-xl" />
    ))
  ) : (
    homeworks.map(hw => /* existing card markup */)
  )}
  ```

- [ ] **Step 3: DOCX export 로딩**

  `app/(champion)/charter/page.tsx` exportDocx 함수 호출 부분:
  - `exporting: boolean` state 추가
  - 클릭 시 `setExporting(true)`, 완료/실패 후 `setExporting(false)` (try/finally)
  - 버튼: `disabled={exporting}`, 텍스트 `{exporting ? '내보내는 중...' : 'DOCX 내보내기'}`, 옵션: `<Spinner size="sm" />` 아이콘 표시

- [ ] **Step 4: EmptyState 적용**

  대상 페이지의 빈 list 자리에 `<EmptyState />`:
  - `app/admin/requests/page.tsx` — 요청 0개 시: `<EmptyState icon={Inbox} title="대기 중인 요청이 없습니다" />`
  - `app/(champion)/milestones/page.tsx` — milestone 0개 시
  - `app/(champion)/charter/page.tsx` — charter 0개 시
  - 기타 빈 list

  사용 가능한 아이콘 import 예시:
  ```ts
  import { Inbox, FileText, ListTodo } from 'lucide-react'
  ```

- [ ] **Step 5: TypeScript 컴파일 확인**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add app/
  git commit -m "feat(ui): Spinner/Skeleton/EmptyState 통일 적용"
  ```

- [ ] **Step 7: Obsidian append**

  ```markdown

  ### 8. 로딩 + 빈 상태 일관화
  **Problem:** 로딩 중 표시가 `<p>로딩 중...</p>` 단순 텍스트. 챔피언 홈은 빈 list 상태가 로딩 중인지 0개인지 구분 불가. DOCX export 클릭 후 2-4초 응답 없음. 빈 list는 페이지마다 다른 문구로 ad-hoc 처리.
  **Solution:** 모든 `로딩 중` 텍스트를 `<FullPageSpinner />`로 교체 (Lucide Loader2 + animate-spin). 챔피언 홈에 `<Skeleton />` 카드 4개로 첫 로드 표시. DOCX export 버튼은 진행 중 disabled + Spinner 아이콘. 빈 list는 `<EmptyState icon={Lucide} title=".." />`로 통일. 커밋 <SHA>.
  **TIL:** Skeleton과 Spinner는 같이 쓰지 않음 — Skeleton은 첫 로드(content shape이 알려진 경우), Spinner는 액션 중(button-level). DOCX 같은 동기 무거운 연산은 try/finally로 항상 setExporting(false) 보장.
  ```

---

## Task 9: Phase 4 — 잔여 폴리시 (조건부)

**Files:**
- Modify: `app/admin/progress/page.tsx`, `app/(champion)/layout.tsx`, `app/admin/layout.tsx`, `app/(champion)/page.tsx`

- [ ] **Step 1: admin/progress 하드코딩 hex → CSS variable**

  `app/admin/progress/page.tsx` L43-44 부근의 `STATUS_COLOR` 객체:

  ```ts
  // Before
  const STATUS_COLOR: Record<MilestoneStatus, string> = {
    not_started: '#94a3b8',
    in_progress: '#f59e0b',
    completed: '#22c55e',
    delayed: '#ef4444',
  }

  // After
  const STATUS_COLOR: Record<MilestoneStatus, string> = {
    not_started: 'var(--text-disabled)',
    in_progress: 'var(--amber)',
    completed: 'var(--success)',
    delayed: 'var(--error)',
  }
  ```

  (실제 매핑 — globals.css의 변수와 매칭)

- [ ] **Step 2: nav emoji aria-label**

  `app/(champion)/layout.tsx`와 `app/admin/layout.tsx`의 nav `<a>` 태그:

  ```tsx
  // Before
  <a href="/">📋 과제</a>

  // After
  <a href="/" aria-label="과제 목록">
    <span aria-hidden="true">📋</span> 과제
  </a>
  ```

  emoji는 visual decoration → `aria-hidden="true"`, `<a>` 자체에 명확한 `aria-label`. 실제로는 visible 텍스트가 이미 명확하면 `aria-label` 생략하고 `<span aria-hidden>` 만으로도 충분.

- [ ] **Step 3: 상태 배지에 아이콘 추가 (color-only 보완)**

  `app/(champion)/page.tsx`의 status 배지 (미제출/검토중/합격/불합격) — 색상만으론 colorblind 사용자 식별 어려움. Lucide 아이콘 추가:

  ```tsx
  import { Clock, CheckCircle2, XCircle, FileX } from 'lucide-react'

  const STATUS_ICON = {
    not_submitted: FileX,
    pending: Clock,
    accepted: CheckCircle2,
    declined: XCircle,
  }

  // 사용
  const Icon = STATUS_ICON[status]
  <span style={{ color: ... }}>
    <Icon className="inline h-3 w-3 mr-1" aria-hidden="true" />
    {label}
  </span>
  ```

- [ ] **Step 4: TypeScript 컴파일 확인**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add app/
  git commit -m "feat(ui): 폴리시 — hex→var, nav aria, 상태 배지 아이콘"
  ```

- [ ] **Step 6: Obsidian append**

  ```markdown

  ### 9. 잔여 폴리시 (a11y + 디자인 토큰 통일)
  **Problem:** ① `admin/progress/page.tsx`에 하드코딩 hex 4개 — 다른 곳은 모두 CSS var. ② nav 링크가 emoji + 텍스트 — emoji가 screen reader에 그대로 읽힘. ③ 상태 배지가 색상-only 식별 → colorblind 접근성.
  **Solution:** ① STATUS_COLOR 하드코딩 hex → `var(--text-disabled)`, `var(--amber)` 등. ② nav emoji를 `<span aria-hidden="true">`로 감싸 SR에서 제외. ③ Lucide 아이콘(Clock, CheckCircle2, XCircle 등) 상태 배지에 추가. 커밋 <SHA>.
  **TIL:** 디자인 토큰 통일은 grep으로 일괄 찾기 쉬움 (`grep -rn "#[0-9a-f]\{6\}" app/`). a11y 색상-only 안티패턴은 WCAG 1.4.1 — 색상 외 추가 식별자(아이콘/텍스트/패턴) 필수.
  ```
