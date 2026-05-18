# UI/UX Polish (shadcn/ui 도입 + 4개 묶음 적용) Implementation Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** shadcn/ui + Radix를 도입해 재사용 가능한 common UI primitive를 만들고, 17개 UX 이슈 중 4개 묶음(toast 통일 / modal UX / 확인 다이얼로그 / 빈 상태·로딩)을 챔피언+어드민 양쪽에 일관 적용한다.

**Architecture:** Phase 1(인프라 셋업) → Phase 2(컴포넌트 설치/작성) → Phase 3(4개 묶음 적용) → Phase 4(잔여 폴리시). 기존 inline style + CSS variable 관례는 페이지에 그대로 두고, 신규 shadcn 컴포넌트만 Tailwind 클래스 사용. 점진 마이그레이션.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS (기존), shadcn/ui (new-york style), Radix UI (Dialog/AlertDialog), Sonner (Toast), Lucide Icons, TypeScript

---

## 1. shadcn/ui 도입 결정 배경

기존 코드베이스:
- 모든 페이지가 `style={{ background: 'var(--surface-primary)' }}` 패턴
- `globals.css`에 `--text-primary`, `--blue-600`, `--amber`, `--success`, `--error`, `--border-subtle` 등 디자인 토큰
- Tailwind는 layout(`flex`, `gap-2`, `min-w-0`)만 사용

shadcn/ui 도입 후:
- 신규 components/ui/* 컴포넌트는 Tailwind 유틸 클래스로 작성 (shadcn 관례)
- shadcn semantic 변수(`--background`, `--primary`, `--destructive`)는 globals.css에 **추가**, 기존 변수는 **유지**
- 페이지는 inline-style 그대로, 신규 컴포넌트만 호출
- **장점:** Radix 접근성 + animation 무료, 충돌 없음
- **트레이드오프:** 두 스타일 시스템 공존 (수용 가능, 점진 통일 가능)

## 2. Phase 1 — shadcn 인프라 셋업

### 2.1 shadcn init 실행

```bash
cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
npx shadcn@latest init
```

선택 사항:
- Style: **new-york**
- Base color: **slate** (기존 디자인 컬러와 가장 유사)
- CSS variables: **Yes**

이 명령은 다음을 생성/수정:
- `components.json` (신규)
- `lib/utils.ts` (신규) — `cn()` helper
- `tailwind.config.ts` (수정) — shadcn 토큰 추가
- `app/globals.css` (수정) — shadcn 변수 추가

### 2.2 globals.css 충돌 해결

shadcn init이 `:root` 안에 `--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring` 등을 추가한다. 기존 `--text-primary`, `--blue-600` 등과 **공존**:

```css
@layer base {
  :root {
    /* 기존 (유지) */
    --text-primary: ...;
    --blue-600: ...;
    --success: ...;
    --error: ...;
    /* ... */

    /* shadcn 추가 */
    --background: ...;
    --foreground: ...;
    --primary: ...;
    --primary-foreground: ...;
    --destructive: ...;
    --destructive-foreground: ...;
    --border: ...;
    --ring: ...;
    /* ... */
  }
}
```

shadcn 변수는 자동 추가되므로 기존 변수만 보존하면 된다.

### 2.3 의존성 추가 (자동)

`npx shadcn init` + 컴포넌트 설치 명령이 자동으로:
- `tailwindcss-animate`
- `class-variance-authority`
- `clsx`
- `tailwind-merge`
- `lucide-react`

설치한다. 별도 npm install 불필요.

## 3. Phase 2 — 컴포넌트 설치 + 자체 보강

### 3.1 shadcn 컴포넌트 4개 설치

```bash
npx shadcn@latest add sonner
npx shadcn@latest add dialog
npx shadcn@latest add alert-dialog
npx shadcn@latest add skeleton
```

각 명령은 `components/ui/<name>.tsx` 파일 생성.

### 3.2 자체 추가 2개

#### `components/ui/spinner.tsx`

```tsx
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASS = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return <Loader2 className={cn('animate-spin text-muted-foreground', SIZE_CLASS[size], className)} aria-label="로딩 중" />
}

export function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <Spinner size="lg" />
    </div>
  )
}
```

#### `components/ui/empty-state.tsx`

```tsx
import { LucideIcon } from 'lucide-react'
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
      {Icon && <Icon className="h-12 w-12 text-muted-foreground mb-4" />}
      <p className="text-base font-semibold text-foreground mb-1">{title}</p>
      {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
      {action}
    </div>
  )
}
```

### 3.3 Toast 전역 설정

`app/layout.tsx` (root layout)에 `<Toaster />` 추가:

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

이후 모든 핸들러에서 `import { toast } from 'sonner'` 후 `toast.success('...')` / `toast.error('...')` 호출.

## 4. Phase 3 — A/B/C/D 묶음 적용

### 4.1 A. Toast/에러 핸들링 통일

대상 페이지 (apiFetch().catch() 또는 silent failure 모든 사이트):
- `app/(champion)/page.tsx` — homework fetch
- `app/(champion)/homework/[id]/page.tsx` — submission/charter/milestone fetches
- `app/(champion)/charter/page.tsx` — charter list + save
- `app/(champion)/milestones/page.tsx` — milestone CRUD + deadline request
- `app/admin/kanban/page.tsx` — 기존 toast 제거 → `sonner` 사용
- `app/admin/requests/page.tsx` — handleReview에 try/catch + toast
- `app/admin/progress/page.tsx` — fetch failures
- `app/admin/homework/[id]/page.tsx` 등

패턴:
```ts
import { toast } from 'sonner'

apiFetch(url).then(setData).catch(e => toast.error('데이터 로드 실패: ' + (e?.message ?? '알 수 없는 오류')))
```

성공 액션은 `toast.success('저장되었습니다.')` 등.

### 4.2 A 추가: Charter 에디터 unsaved-changes 경고

`app/(champion)/charter/page.tsx` `CharterPanel`:
- `dirtyRef` ref 추가, TipTap onChange에서 `dirtyRef.current = true`
- 저장 후 `dirtyRef.current = false`
- `onClose` 호출 전 가드: dirty면 AlertDialog로 확인 ("저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?")

### 4.3 B. Modal UX

기존 modal `<div>` (수동 backdrop + close button)을 shadcn `Dialog`로 교체. 자동 혜택:
- Esc-to-close
- focus trap
- role="dialog" + aria-modal
- backdrop click close
- fade-in animation

대상 modal:
- `app/(champion)/milestones/page.tsx` — resubmit modal, edit modal, deadline request modal (3개)
- `app/(champion)/homework/[id]/page.tsx` — milestone edit modal (1개)

추가: Comment/Reply textarea에 Ctrl+Enter submit:
- `app/(champion)/homework/[id]/page.tsx` — submission comment textarea
- `components/CharterCommentPanel.tsx` 등

### 4.4 C. ConfirmDialog + 성공 피드백

shadcn `AlertDialog`로 destructive 액션 confirm:
- `app/admin/requests/page.tsx` — 기한변경 승인/반려 (현재 즉시 실행)
- `app/admin/kanban/page.tsx` — 합격/불합격 처리 (DnD drop) — 부드러운 흐름 방해 가능, **DnD에는 confirm 생략, 합격→불합격 등 status 변경에만 확인** (or 전부 skip, 결정 필요)
- `app/(champion)/milestones/page.tsx` — 마일스톤 삭제 (현재 2단계 버튼 → AlertDialog로 통일)
- `app/(champion)/homework/[id]/page.tsx` — 마일스톤 삭제

성공 toast:
- `app/(champion)/milestones/page.tsx` `handleUpload` — 파일 업로드 성공 시 toast.success
- `app/(champion)/charter/page.tsx` — 저장 성공 시
- 기타 명시적 액션 성공 시 모두

> **결정 필요:** kanban DnD에 confirm 넣을지? — **포함하지 않음**으로 가정 (drop의 부드러움 우선)

### 4.5 D. 빈 상태 + 로딩

대상:
1. **로딩 텍스트 → Spinner**: 모든 `<p>로딩 중...</p>`을 `<FullPageSpinner />` 또는 `<Spinner />`로 교체 (champion + admin)
2. **챔피언 홈 skeleton**: `app/(champion)/page.tsx` 첫 로드 시 `<Skeleton>` 카드 N개 표시
3. **DOCX export**: `app/(champion)/charter/page.tsx` exportDocx — 진행 중 버튼 disabled + Spinner 아이콘
4. **빈 list → EmptyState**: 
   - 챔피언 homework 0개 (가능성 낮으나 방어)
   - 챔피언 milestone 0개
   - 챔피언 charter 0개
   - admin requests 0개 (현재 "요청이 없습니다" → EmptyState 컴포넌트로 통일)

## 5. Phase 4 — 잔여 폴리시 (선택 적용)

기존 audit의 Low severity 항목:
- `app/admin/progress/page.tsx` L43-44 — 하드코딩 hex → CSS var
- `app/(champion)/layout.tsx` + `app/admin/layout.tsx` nav emoji → `aria-hidden="true"` + 명시 `aria-label`
- 상태 배지 — 색상 + 아이콘 (Lucide CheckCircle/XCircle/Clock 등) — champion homepage status에 적용

Phase 4는 시간 여유 시 진행. Phase 3까지가 핵심 목표.

## 6. 변경/추가 파일 목록

### 신규 (Phase 1+2)
| 파일 | 역할 |
|------|------|
| `components.json` | shadcn 설정 |
| `lib/utils.ts` | `cn()` helper |
| `components/ui/sonner.tsx` | Toast UI |
| `components/ui/dialog.tsx` | Modal primitive |
| `components/ui/alert-dialog.tsx` | Confirm primitive |
| `components/ui/skeleton.tsx` | 로딩 placeholder |
| `components/ui/spinner.tsx` | 자체 Spinner |
| `components/ui/empty-state.tsx` | 자체 EmptyState |

### 수정 (Phase 1+3+4)
| 파일 | 변경 |
|------|------|
| `package.json` / lock | shadcn 의존성 추가 |
| `tailwind.config.ts` | shadcn 토큰 |
| `app/globals.css` | shadcn 변수 추가 (기존 보존) |
| `app/layout.tsx` | `<Toaster />` 추가 |
| `app/(champion)/page.tsx` | toast + skeleton |
| `app/(champion)/homework/[id]/page.tsx` | toast + Dialog + Ctrl+Enter |
| `app/(champion)/charter/page.tsx` | toast + DOCX 로딩 + unsaved 경고 |
| `app/(champion)/milestones/page.tsx` | toast + Dialog x3 + AlertDialog + 성공 toast |
| `app/admin/kanban/page.tsx` | 기존 toast → sonner |
| `app/admin/requests/page.tsx` | toast + AlertDialog |
| `app/admin/progress/page.tsx` | toast + hex→var |
| `app/admin/homework/[id]/page.tsx` | toast |
| `app/admin/homework/[id]/[userId]/page.tsx` | toast |
| `app/(champion)/layout.tsx` / `app/admin/layout.tsx` | nav aria-label |

## 7. Obsidian 문서화

`feedback_obsidian_docs.md` 메모리 정책에 따라, **각 enhancement마다 daily note(2026-05-18.md)에 problem/solution/TIL 블록을 추가**한다.

블록 형식:
```markdown
### N. <enhancement 짧은 이름>
**Problem:** 무엇이 잘못됐는지 (관련 file:line)
**Solution:** 무엇을 했는지 (커밋 SHA)
**TIL:** 재사용 가능한 교훈 (또는 "n/a")
```

구현 중 매 commit 후 또는 매 task 후 daily note에 append.

## 8. 에러 처리 / 운영

- shadcn init이 globals.css나 tailwind.config을 잘못 덮어쓸 위험 → init 전 두 파일 백업 후 diff 검토
- `<Toaster />`는 root layout 1회만 마운트
- sonner의 `richColors` prop이 디자인과 안 맞으면 제거 가능
- Phase별로 commit 단위 작게: 각 컴포넌트 설치 = 1커밋, 각 페이지 마이그레이션 = 1커밋
- 새 브랜치 사용 권장: `feature/ui-polish` (현재 `feature/emailing`과 분리)

## 9. 결정 필요 항목

| 항목 | 옵션 | 권장 |
|------|------|------|
| kanban DnD에 confirm 적용? | yes / no | **no** (drop 흐름 방해) |
| 새 브랜치 vs feature/emailing 계속? | 새 브랜치 / 계속 | **새 브랜치** (분리 머지) |
| Phase 4 (Low severity) 포함? | yes / no | **시간 여유 시 yes** |
