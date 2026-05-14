# AX Homework Submission — Design Spec

**Date:** 2026-05-14  
**Last updated:** 2026-05-14 (v2 — project management layer added)
**Status:** Approved  

---

## 1. Overview

A web application with two interconnected layers:

**Homework layer** — Champions (users) submit homework files assigned by admin. Admin reviews, comments, and accepts/declines submissions.

**Project management layer** — Champions self-author a 제정의서 (project charter) and create their own weekly WBS (milestone plan). Progress is visualized as a Gantt chart. Admin compares all champions side-by-side, reviews deadline change requests, and generates weekly progress reports.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router, CSR) | All pages are client components |
| Styling | Tailwind CSS | FLO Design System tokens via CSS variables |
| Design System | FLO Design System 1.0 | Pretendard font, dark-first, semantic color tokens |
| Auth | Supabase Auth | Google OAuth (users) · Email/password (admin) |
| Database | Supabase PostgreSQL | Service key only — no client-side DB access |
| File Storage | Supabase Storage | Signed URLs generated server-side |
| API Layer | Next.js API Routes | All DB/storage operations go here |
| WYSIWYG Editor | TipTap | Homework description (admin) + charter sections (champion) |
| Markdown Viewer | react-markdown | Submission preview for .md files |
| Gantt Chart | gantt-task-react | Weekly milestone visualization |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable | Kanban board drag interactions |
| PDF Export | jsPDF + html2canvas | Charter + weekly report export |
| DOCX Export | docx | Charter export as Word document |

---

## 3. Security Model

**Hard requirement: no user-level DB access.**

- The Supabase **service key** lives only in Next.js API routes (server-side env var). It is never sent to the browser.
- The browser holds only a **Supabase Auth JWT** (session token).
- Every API route verifies the JWT before acting. Admin routes additionally check the `is_admin` flag in user metadata.
- Supabase RLS is set to **DENY ALL** on all tables as a backstop.
- Supabase Storage bucket is **private** — files are accessed via short-lived signed URLs generated server-side.

```
Browser (CSR)  —[JWT]→  Next.js API Routes  —[service key]→  Supabase DB / Storage
```

---

## 4. Authentication

### User (Google OAuth)
1. Click "Google로 계속하기" on `/login`
2. Supabase OAuth redirect → Google → callback
3. Supabase creates/updates the user; API route upserts a row in `users` table
4. JWT stored via `@supabase/ssr` — persisted in cookies, readable by both browser and API routes
5. All subsequent API calls send the JWT via `Authorization: Bearer <token>` header

### Admin (Email + Password)
1. Navigate to `/admin/login`
2. `supabase.auth.signInWithPassword({ email, password })`
3. Admin account has `user_metadata.is_admin = true` (set once via Supabase dashboard)
4. API routes check this claim on every admin endpoint — return 403 if absent
5. Admin credentials stored as Supabase Auth user; not in application DB

---

## 5. Data Model

See `docs/ERD.md` for the full diagram.

### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| email | text | from Google profile |
| name | text | from Google profile |
| avatar_url | text | from Google profile |
| created_at | timestamptz | |

### `homeworks`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | auto-increment = homework number shown in UI |
| title | text NOT NULL | |
| description | text | HTML output from TipTap WYSIWYG |
| due_date | date NOT NULL | |
| created_at | timestamptz | |

### `submissions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | → `users.id` |
| homework_id | int FK | → `homeworks.id` |
| file_path | text | Supabase Storage path |
| file_name | text | original filename (for display) |
| status | enum | `pending` \| `accepted` \| `declined` |
| attempt_number | int | increments per (user_id, homework_id) pair |
| submitted_at | timestamptz | |

### `comments`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| submission_id | uuid FK | → `submissions.id` |
| body | text NOT NULL | admin-authored plain text |
| created_at | timestamptz | |

### Storage path convention
```
bucket: submissions  (private)
path:   {user_id}/{homework_id}/{attempt_number}/{original_filename}
```

---

## 5b. Route Protection (Middleware)

Next.js `middleware.ts` runs on every request before rendering:

| Path pattern | Rule |
|---|---|
| `/login`, `/admin/login` | Redirect to `/` (or `/admin`) if already authenticated |
| `/`, `/homework/*` | Redirect to `/login` if no valid session |
| `/admin`, `/admin/*` (except `/admin/login`) | Redirect to `/admin/login` if no valid session, or 403 if not admin |

Middleware reads the Supabase session from cookies using `@supabase/ssr` — no DB call needed.

---

## 6. Page Structure & Routes

### Champion (user) routes
| Route | Page | Description |
|---|---|---|
| `/login` | Login | Google OAuth sign-in |
| `/` | Homework List | All homeworks with latest submission status · toggle list ↔ board view |
| `/homework/[id]` | Homework Detail | Full submission history + resubmit upload |
| `/charter` | 제정의서 | Write project charter; export PDF / DOCX |
| `/milestones` | WBS Creator | Add/edit weekly milestones; upload deliverables; request deadline change |
| `/progress` | My Gantt | Personal milestone Gantt chart with delay alerts |

### Admin routes
| Route | Page | Description |
|---|---|---|
| `/admin/login` | Admin Login | Email + password sign-in |
| `/admin` | Dashboard | All homeworks with submission progress (X/N submitted) |
| `/admin/homework/[id]` | Homework Submissions | Per-homework list of all champions + their status |
| `/admin/homework/[id]/[userId]` | Submission Review | Full submission history for one champion + review panel |
| `/admin/homework/new` | Create Homework | TipTap editor, title, due date |
| `/admin/kanban` | Submission Kanban | Drag-and-drop board: 미제출 · 검토중 · 합격 · 불합격; filter by homework |
| `/admin/progress` | Champion Progress | Multi-champion Gantt; checkbox filter; delay alerts |
| `/admin/requests` | Deadline Requests | Review + approve/reject deadline change requests |
| `/admin/reports` | Weekly Reports | Generate + download weekly progress reports per champion |

---

## 7. UI Design

**Design System:** FLO Design System 1.0 — Mobile  
**Font:** Pretendard (fallback: Apple SD Gothic Neo, system-ui)  
**Theme:** Dark-first. Semantic tokens mapped to Tailwind CSS variables.

### Key color tokens used
| Token | Role |
|---|---|
| `background` | Page background (`#141414`) |
| `surface_primary` | Card / panel background (`#1a1a1a`) |
| `surface_secondary` | Input / inner panel (`#111`) |
| `text_primary` | Primary text (`#f5f5f5`) |
| `text_secondary` | Secondary / meta text (`#888`) |
| `text_disabled` | Muted / placeholder (`#555`) |
| `blue_600` | Accent / primary button (`#2563eb`) |
| `border_subtle` | Dividers, card borders (`#2a2a2a`) |
| `error` | Decline / danger (`#f87171`) |
| `success` | Accept / pass (`#4ade80`) |

### Status badges
| Status | Korean | Color |
|---|---|---|
| `pending` | 검토 중 | amber |
| `accepted` | 합격 | green |
| `declined` | 불합격 | red |
| not submitted | 미제출 | gray |

### File preview (admin submission review)
| File type | Preview |
|---|---|
| `.md` | Rendered inline via `react-markdown` |
| `.pdf` | Embedded `<iframe>` using signed storage URL |
| `.zip` / other | No preview — prominent download button |

All file types always show a download button regardless of preview availability.

---

## 7b. Project Management UI Details

### 제정의서 (`/charter`)
- TipTap WYSIWYG editor per section: 프로젝트명, 문제 정의 (AS-IS), 목표 (TO-BE), 범위 (In/Out), 기대 효과, 리스크
- Auto-saves on blur (PATCH `/api/charter`)
- **Export PDF:** client-side via `html2canvas` + `jsPDF` — captures rendered HTML
- **Export DOCX:** client-side via `docx` library — maps section content to Word paragraphs

### WBS Creator (`/milestones`)
- Table rows: Week # · Title · Start–Due dates · Status · Actions
- **Status badges:** 완료 (green) · 진행 중 (amber) · 지연⚠️ (red) · 미시작 (gray)
- **Actions per milestone:**
  - 📤 산출물 업로드 → file picker → POST `/api/milestones/[id]/deliverables` → status auto-set to `completed`
  - ▶ 진행 중 → PATCH `/api/milestones/[id]` `{ is_manual_progress: true }` → status set to `in_progress`
  - 📅 기한 변경 → modal: new date + reason → POST `/api/deadline-requests`
- Delay detection: `due_date < today` + no deliverable + not manual → show ⚠️ alert banner

### Personal Gantt (`/progress`)
- `gantt-task-react` component with milestones as tasks
- Color-coded bars by status
- Today's week highlighted in blue
- Alert banner for each delayed milestone

### Multi-Champion Gantt (`/admin/progress`)
- One row per champion (filtered by checkboxes)
- Same color coding; ⚠️ on delayed bars
- Inline deadline request panel: shows pending requests with Approve / Reject buttons

### Deadline Requests (`/admin/requests`)
- Table: champion · milestone · current due → requested due · reason · status
- Approve → PATCH request + updates `milestones.due_date`
- Optional: assign support staff via dropdown (sets `support_assignee`)

### Submission Kanban (`/admin/kanban`)
- **Library:** `@dnd-kit/core` + `@dnd-kit/sortable` (accessible, touch-friendly, no required CSS)
- **4 columns:** 미제출 · 검토 중 · 합격 · 불합격
- **Drag behaviour:**
  - Only cards in "검토 중" are draggable (미제출 cards cannot be moved)
  - Drop onto 합격 → PATCH `/api/admin/submissions/[id]` `{ status: 'accepted' }`
  - Drop onto 불합격 → same PATCH with `{ status: 'declined' }`
  - Drop back onto 검토 중 → reverts to `pending` (undo)
  - Drop zone highlights on hover during drag
  - Optimistic UI update — revert on API error with toast
- **Filter:** dropdown to show all homeworks or one specific homework
- **Cards show:** champion name + homework number + attempt number + filename + submission date
- **미제출 column** is read-only; shows champions who haven't submitted for the selected homework

### Champion Board View (`/`)
- Toggle button (☰ 목록 ↔ ⊞ 보드) on the homework list page
- Same 4 columns, read-only — no drag interaction
- 불합격 cards show an inline "재제출 →" button linking to `/homework/[id]`
- State persisted in `localStorage` (remembers preferred view mode)

### Weekly Reports (`/admin/reports`)
- Select week number → generate report
- Report shows each champion: milestones due that week, status, any delays
- Download as PDF (jsPDF) or display inline

---

## 8. API Routes

All routes require a valid JWT. Admin routes additionally require `is_admin = true` in JWT metadata.

### User API
| Method | Route | Description |
|---|---|---|
| GET | `/api/homeworks` | List all homeworks |
| GET | `/api/homeworks/[id]` | Single homework detail |
| GET | `/api/submissions/mine` | Current user's submissions (all homeworks) |
| GET | `/api/submissions/mine/[homeworkId]` | Current user's submissions for one homework |
| POST | `/api/submissions` | Upload a new submission (multipart/form-data) |

### Charter API
| Method | Route | Description |
|---|---|---|
| GET | `/api/charter` | Get current champion's charter |
| PUT | `/api/charter` | Create or update charter (upsert) |

### Milestones API
| Method | Route | Description |
|---|---|---|
| GET | `/api/milestones` | List current champion's milestones |
| POST | `/api/milestones` | Create a milestone |
| PATCH | `/api/milestones/[id]` | Update milestone (title, dates, status, is_manual_progress) |
| DELETE | `/api/milestones/[id]` | Delete a milestone |
| POST | `/api/milestones/[id]/deliverables` | Upload deliverable → auto-completes milestone |
| POST | `/api/deadline-requests` | Submit a deadline change request |

### Admin API
| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/kanban` | All submissions grouped by status (optionally filtered by homework_id) |
| GET | `/api/admin/homeworks` | List all homeworks with submission counts |
| POST | `/api/admin/homeworks` | Create a new homework |
| GET | `/api/admin/homeworks/[id]/submissions` | All submissions for a homework |
| GET | `/api/admin/homeworks/[id]/submissions/[userId]` | One user's full submission history |
| PATCH | `/api/admin/submissions/[id]` | Update status (accept/decline) |
| POST | `/api/admin/submissions/[id]/comments` | Add a comment to a submission |
| GET | `/api/admin/storage/[submissionId]/download` | Generate signed download URL |
| GET | `/api/admin/milestones` | All champions' milestones (for progress comparison) |
| GET | `/api/admin/deadline-requests` | List all pending/reviewed requests |
| PATCH | `/api/admin/deadline-requests/[id]` | Approve or reject; updates milestone due_date on approve |
| GET | `/api/admin/reports/[weekNumber]` | Generate weekly progress report data |

---

## 9. Key Behaviours

- **Resubmission:** Declining a submission allows the user to resubmit. Each resubmit increments `attempt_number`. The admin sees the full attempt history in chronological order, with the latest attempt at the top.
- **Homework number:** `homeworks.id` (serial) is the homework number shown in the UI (e.g., `# 01`, `# 02`).
- **Admin is single:** One admin account provisioned once via Supabase dashboard. No admin management UI needed.
- **File storage:** Files are never served via public URLs. The admin download endpoint generates a short-lived signed URL (60s TTL) and redirects.
- **Markdown description:** Homework descriptions written with TipTap are stored as HTML and rendered with `dangerouslySetInnerHTML` (sanitized via DOMPurify) in the user-facing homework detail page.

---

## 10. Key Behaviours (Project Management Layer)

- **Milestone status** is computed and stored server-side. Any deliverable upload sets `completed`. `is_manual_progress = true` sets `in_progress`. Stale check: a daily cron (or on-read computation) marks `delayed` when `due_date < today` and status is still `not_started`.
- **Deadline change**: champion submits request → admin approves → `milestones.due_date` updated atomically. Rejected requests leave the due date unchanged.
- **Gantt library**: `gantt-task-react` receives milestone data shaped as `Task[]` objects. Bars are color-coded by status via `styles` prop.
- **Weekly report**: generated server-side from `/api/admin/reports/[weekNumber]` which returns structured JSON; client renders and exports via jsPDF.
- **Charter export**: purely client-side — no server round-trip. PDF captures the rendered DOM; DOCX uses the raw `content` jsonb fields.

---

## 11. Out of Scope

- Email / push notifications
- Multiple admin accounts
- Homework deadlines enforced server-side (display only)
- File size limits (deferred to Supabase Storage defaults)
- Pagination (deferred)
- Real-time Gantt updates (polling on page focus is sufficient)
