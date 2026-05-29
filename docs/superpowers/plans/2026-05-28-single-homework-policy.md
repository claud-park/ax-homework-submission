# Single Homework Policy 적용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "과제는 항상 한 개만 제공된다" 정책에 맞게 DB 스키마와 API의 불일치를 해소한다.

**Architecture:** `submissions.homework_id`를 nullable로 변경하는 migration 추가 + 댓글 알림 API 2곳에서 `homework_id`가 null일 때의 fallback 처리를 추가한다. UI 변경은 불필요.

**Tech Stack:** Supabase (PostgreSQL), Next.js App Router API routes, TypeScript

---

## 변경 파일 목록

| 파일 | 작업 |
|---|---|
| `supabase/migrations/012_submissions_homework_id_nullable.sql` | 신규 생성 |
| `app/api/submissions/[id]/comments/route.ts` | null fallback 추가 |
| `app/api/admin/submissions/[id]/comments/route.ts` | null fallback 추가 |

---

## Task 1: DB Migration — submissions.homework_id nullable

**Files:**
- Create: `supabase/migrations/012_submissions_homework_id_nullable.sql`

- [ ] **Step 1: migration 파일 생성**

```sql
-- submissions.homework_id: NOT NULL → nullable
-- 단수 과제 정책: 과제는 항상 한 개만 제공되므로 제출 시 homework_id 명시 불필요
alter table submissions
  alter column homework_id drop not null;
```

- [ ] **Step 2: typecheck 실행**

```bash
bun run typecheck
```

Expected: 에러 없음 (스키마 변경만이라 TS에 영향 없음)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_submissions_homework_id_nullable.sql
git commit -m "fix: drop NOT NULL on submissions.homework_id (단수 과제 정책)"
```

---

## Task 2: Champion 댓글 API — null homework_id fallback

**Files:**
- Modify: `app/api/submissions/[id]/comments/route.ts:38-41`

현재 코드 (38-41번째 줄):
```typescript
const hw = submission.homeworks as { title: string } | { title: string }[] | null
const hwTitle = Array.isArray(hw) ? hw[0]?.title : hw?.title
const contextTitle = `#${String(submission.homework_id).padStart(2, '0')} ${hwTitle ?? ''}`
const link = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/admin/homework/${submission.homework_id}`
```

- [ ] **Step 1: null fallback 적용**

아래 내용으로 38-41번째 줄을 교체한다:

```typescript
const hw = submission.homeworks as { title: string } | { title: string }[] | null
const hwTitle = Array.isArray(hw) ? hw[0]?.title : hw?.title
const contextTitle = submission.homework_id != null
  ? `#${String(submission.homework_id).padStart(2, '0')} ${hwTitle ?? ''}`
  : '과제 제출'
const link = submission.homework_id != null
  ? `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/admin/homework/${submission.homework_id}`
  : `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/admin/kanban`
```

- [ ] **Step 2: typecheck 실행**

```bash
bun run typecheck
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add app/api/submissions/[id]/comments/route.ts
git commit -m "fix: handle null homework_id in champion comment notification"
```

---

## Task 3: Admin 댓글 API — null homework_id fallback

**Files:**
- Modify: `app/api/admin/submissions/[id]/comments/route.ts:38-41`

현재 코드 (38-41번째 줄):
```typescript
const hw = subRow.homeworks as { title: string } | { title: string }[] | null
const hwTitle = Array.isArray(hw) ? hw[0]?.title : hw?.title
const contextTitle = `#${String(subRow.homework_id).padStart(2, '0')} ${hwTitle ?? ''}`
const link = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/homework/${subRow.homework_id}`
```

- [ ] **Step 1: null fallback 적용**

아래 내용으로 38-41번째 줄을 교체한다:

```typescript
const hw = subRow.homeworks as { title: string } | { title: string }[] | null
const hwTitle = Array.isArray(hw) ? hw[0]?.title : hw?.title
const contextTitle = subRow.homework_id != null
  ? `#${String(subRow.homework_id).padStart(2, '0')} ${hwTitle ?? ''}`
  : '과제 제출'
const link = subRow.homework_id != null
  ? `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/homework/${subRow.homework_id}`
  : `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/my-project/submission`
```

- [ ] **Step 2: typecheck 실행**

```bash
bun run typecheck
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/submissions/[id]/comments/route.ts
git commit -m "fix: handle null homework_id in admin comment notification"
```
