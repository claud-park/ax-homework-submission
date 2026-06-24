# AX Homework Submission Platform — PRD

> **Version** 2.3 · **Updated** 2026-06-24 · **Author** yr.park@dreamus.io
> **Status** Internal Review · **Repo** `AX/ax-homework-submission`
> **Previous** v2.2 (2026-06-16) · v2.0 (2026-06-02) · v1.1 (2026-05-21)

---

## 0. Executive Summary (IR-style)

### One-liner
**A full-stack web application that unifies the entire AX program lifecycle — task definition → execution → review → feedback — on a single platform.**

### Why Now
AX program operations involve multiple champions executing multi-milestone assignments, but current submit/review workflows are fragmented across email, spreadsheets, and Slack. This platform integrates the full lifecycle: **Charter → WBS Milestones → Final Submission → Pass/Fail judgment**.

### Key Differentiators
| Item | Before | This Platform |
|---|---|---|
| Charter creation | Word attachment | TipTap WYSIWYG + DOCX export |
| Progress visibility | Manual spreadsheet updates | Gantt + champion dashboard auto-sync |
| Review workflow | Email thread | Unidirectional DnD Kanban |
| Feedback loop | Slack / in-person | Bidirectional comments + email alerts (9 triggers) |
| Admin action | Manual outreach | One-click Nudge email from dashboard |
| Auto-save | None | Draft/Publish for task, Charter, Milestone |
| Data security | Shared file server | Supabase RLS DENY ALL + server-only API gateway |
| Deployment | Manual | GitHub Actions CI + Docker + Jenkins CD |
| Mobile access | Desktop-only | Champion & Admin key pages mobile-optimized |

### Current Progress (as of 2026-06-02)
- **Feature completion**: 16 of 17 core areas complete (**94%**) — only Champion progress dashboard remains skeletal
- **Commits**: 200+ (including milestone tree refactor, CI/CD, mobile UX)
- **Data model**: 9 core tables + 3 partial indexes + 1 Storage bucket, RLS policies applied
- **CI/CD**: GitHub Actions (lint · typecheck · build) + Docker + Jenkins complete

### KPI Targets (90 days post-launch)
| Metric | Target | Measurement |
|---|---|---|
| Champion active rate | Weekly active ≥ 70% | Login + Charter/Milestone activity |
| Avg review lead time | Submission → verdict ≤ 24h | submissions.submitted_at → status change |
| Charter submission rate | ≥ 90% of assigned tasks | charter_submissions / homeworks per user |
| Nudge → action conversion | Monitored | charter/milestone completion within 48h of nudge |
| Email delivery rate | ≥ 99% | Nodemailer delivery logs |

### Top Risks
1. **Gmail SMTP limit (500/day)** — alert loss on volume spike. → SendGrid/SES migration prepared (P2).
2. ~~Single admin mailbox~~ — **resolved v2.3**: migrated to 3 individual admin accounts.
3. **Unidirectional Kanban DnD** — no rollback after accept/reject. Mis-verdict recovery undefined.
4. **Nudge rate limiting absent** — same champion can be nudged repeatedly.
5. **Audio processing timeout** — sessions > ~100 min or slow Whisper responses may hit `maxDuration=300`. → Monitor via processing_status=error; reprocess available.
6. **OpenAI/Anthropic API cost** — per-session Whisper + Claude costs accumulate at scale. → `costs` module in `lib/audio-pipeline/` tracks usage.

---

## 1. Problem & Opportunity

### 1.1 Problem
AX program operations run 4 independent information flows simultaneously:
1. **Task definition** — admin assigns tasks to champions
2. **Charter** — champion clarifies problem / goal / scope
3. **Milestones (WBS)** — weekly work plans and deliverable accumulation
4. **Final submission & verdict** — admin's pass/fail decision

Pain points with existing operations:
- **No SSOT** — Charter in Word, progress in Sheet, submissions via email
- **No status visibility** — impossible to see which champion is blocked where
- **Feedback silos** — comments scattered across email threads, context lost
- **Non-standard approval workflow** — deadline change requests handled informally
- **Manual tracking of unregistered champions** — no automated way to identify who hasn't submitted charter or milestones

### 1.2 Opportunity
- Standardized workflow tools are a prerequisite for **scaling AX** (more champions).
- White-label baseline for **reuse across other training/coaching programs**.
- Data accumulation enables **champion performance analytics and coaching insights**.

---

## 2. Target Users

### 2.1 Persona A — Champion (Student/Participant)
- **Goal**: Clearly understand assigned tasks, execute according to plan, and earn a passing verdict
- **Pain**: Unclear requirements / format confusion / delayed feedback
- **Key Actions**: Charter → Milestone registration → Weekly check-in → Deadline change request → Final submission

### 2.2 Persona B — Admin (Operator/Reviewer)
- **Goal**: Monitor all champions' progress at a glance and deliver fast verdicts/feedback
- **Pain**: Tracking async submissions from many champions / overhead of writing and delivering feedback / manually identifying unregistered champions
- **Key Actions**: Dashboard check → Nudge → Charter review → Kanban verdict → Deadline approval

### 2.3 Permission Model
```
Champion = user_metadata.is_admin === false  (default)
Admin    = user_metadata.is_admin === true + user_metadata.name set
```
- All APIs: JWT verification (`verifyJWT`) + admin-only APIs add `verifyAdmin`
- Direct client DB access blocked (Supabase RLS **DENY ALL**)

### 2.4 Admin Account Model (v2.3)
Admin accounts are **individual** — one Supabase Auth user per admin operator, provisioned via `scripts/create-admins.ts` (idempotent, credentials injected via env, uses `SUPABASE_SERVICE_KEY`).

| Account | Email | Metadata |
|---|---|---|
| Alex | `admin_alex@dreamus.io` | `is_admin=true`, `name="Alex"` |
| Claud | `admin_claud@dreamus.io` | `is_admin=true`, `name="Claud"` |
| Jennifer | `admin_jennifer@dreamus.io` | `is_admin=true`, `name="Jennifer"` |

**Migration from shared account**: The previous shared account (`admin@dreamus.io`) is **deactivated** (banned + `is_admin=false`) — not deleted, to preserve foreign-key references. All new records (`admin_user_id`, `author_id`) reference individual admin UUIDs, enabling automatic attribution and audit trails. Benefits: action attribution (who recorded/edited/commented), cost attribution per operator, and elimination of concurrent-edit conflicts.

---

## 3. Solution Overview

### 3.1 System Context
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Browser (CSR)                                                               │
│  Champion UI: /my-project/charter, /my-project/milestones, /progress         │
│               /my-project/sessions (1-on-1 session list + detail)            │
│  Admin UI: /admin, /admin/delay-reports, /admin/reports                      │
│            /admin/champions/[userId] (1-on-1 session management)             │
└──────────────────────┬───────────────────────────────────────────────────────┘
                       │ HTTPS + JWT
                       │ (audio: direct signed-URL PUT → Storage, bypasses API)
┌──────────────────────▼───────────────────────────────────────────────────────┐
│  Next.js 14 App Router                                                       │
│  middleware.ts (role-based routing) + API Routes (app/api/**)                │
│  maxDuration=300 on audio-processing routes                                  │
└────────┬──────────────────────────────────┬───────────────┬───────────────────┘
         │ service_role key                 │ SMTP          │ AI APIs
┌────────▼──────────────────────┐  ┌───────▼──────────┐  ┌─▼──────────────────┐
│  Supabase (RLS DENY ALL)      │  │  Gmail SMTP      │  │  OpenAI Whisper    │
│  Auth (individual admin accts)│  │  (Nodemailer)    │  │  (STT, whisper-1)  │
│  PostgreSQL (12 tables)       │  │  9 triggers      │  │  Anthropic Claude  │
│  Storage (submissions +       │  └──────────────────┘  │  (summarize notes) │
│           check-up-sessions)  │                         └────────────────────┘
└───────────────────────────────┘
```

### 3.2 4-Layer Architecture
| Layer | Technology | Role |
|---|---|---|
| Presentation | React 18 + shadcn/ui + Tailwind + FLO Design System | UI / Interaction |
| Routing/Auth | Next.js 14 App Router + middleware | Role-based routing |
| Business | Next.js API Routes (Node.js) | Business logic / auth enforcement |
| Data | Supabase Auth + PostgreSQL + Storage | Persistence / authentication |

---

## 4. Core Features

### 4.1 Champion Features
| # | Feature | Tech | Status |
|---|---|---|---|
| C1 | Google OAuth login | Supabase Auth | ✅ |
| C2 | Task list view | Next.js | ✅ |
| C3 | **Charter (task definition doc) WYSIWYG** | TipTap, 6-section | ✅ |
| C4 | Charter DOCX export | `docx` library | ✅ |
| C5 | Charter draft / publish | `publish_status` enum | ✅ |
| C6 | Milestone CRUD — **2-depth tree** | Auto status calculation | ✅ |
| C7 | Milestone Gantt visualization | `gantt-task-react` | ✅ |
| C8 | Milestone draft / publish | `publish_status` enum | ✅ |
| C9 | Deadline change request | `deadline_change_requests` | ✅ |
| C10 | Comments / replies (bidirectional alerts) | charter_comments | ✅ |
| C11 | **Weekly check-in (4 actions)** | checkin status workflow | ✅ |
| C12 | **Milestone due date change modal** | start+end for expired not_started | ✅ |
| C13 | **Mobile UX** (BottomTabBar + card layouts) | Responsive components | ✅ |
| C14 | Champion progress dashboard | `/progress` | 🚧 Skeletal |
| C15 | **Smart milestone input** — AI generate (Charter-grounded) / template presets / direct, editable draft staging → batch save | AI SDK v6 + Claude, `MilestoneDraftDrawer` | 📋 Designed (v2.2) |
| C16 | **1-on-1 (Check-up) Session** — view session list, read meeting notes (markdown), toggle action item completion, add comments | `/(champion)/my-project/sessions` | ✅ (v2.3) |

#### Smart Milestone Input (C15)
Single entry `+ 마일스톤 추가 ▾` → three methods converge into one **editable draft (staging) list**, committed in one batch save. Addresses the "add one-by-one" pain.

| Method | Engine |
|---|---|
| ✨ AI generate | `POST /api/milestones/generate` reads Charter content (problem·goal·solution) → `generateObject` → relative-duration milestones. **AI returns structure only; dates computed deterministically** (working-days, holiday-aware) |
| 📋 Template | Built-in presets (product launch / research→MVP→validate / sprint), anchored to a start date |
| ✏️ Direct | Empty draft row (existing inline logic) |

Batch commit: `POST /api/milestones/batch` (parents → children → `syncParentDates`), each row records `source`. Design: [`docs/superpowers/specs/2026-06-16-milestone-input-ux-design.md`](superpowers/specs/2026-06-16-milestone-input-ux-design.md)

#### Charter 6-Section Structure
1. **Problem Definition (AS-IS)** ⭐ Required
2. **Goal (TO-BE)** ⭐ Required
3. **Scope In** ⭐ Required
4. **Scope Out** ⭐ Required
5. Expected outcomes
6. Risks

#### Weekly Check-in — 4 Actions
| Action | Status set | Description |
|---|---|---|
| Mark complete | `completed` | Manual completion flag |
| Report delay | `delayed` | Bottleneck type + notes |
| Request extension | — | New due_date request |
| Mark in progress | `in_progress` | Manual progress flag |

#### Milestone 2-depth Tree
```
depth-0 (parent_milestone_id IS NULL)    → task group (dates optional)
  └── depth-1 (parent_milestone_id NOT NULL)  → actual milestone (dates required)
```

#### Milestone Due Date Change Modal Cases
| Case | Condition | Inputs |
|---|---|---|
| Standard extension | Normal cases | end_date only |
| Start+end change | `start_date < today` AND `status = 'not_started'` | start_date + end_date |

### 4.2 Admin Features
| # | Feature | Tech | Status |
|---|---|---|---|
| A1 | Task creation/editing (draft + publish) | TipTap | ✅ |
| A2 | **Kanban board (unidirectional DnD)** | dnd-kit + optimistic updates | ✅ |
| A3 | Submission detail side panel | Sheet UI (resizable) | ✅ |
| A4 | Charter review & comments | Bidirectional alerts | ✅ |
| A5 | Deadline change approval/rejection | Auto due_date update | ✅ |
| A6 | Email alerts (9 triggers) | Nodemailer + Gmail SMTP | ✅ |
| A7 | Delay report review & response | `/admin/delay-reports` | ✅ |
| A8 | **Champion dashboard** (Gantt + summary table) | ChampionGanttView + ChampionSummaryTable | ✅ |
| A9 | **"Action needed" section** (charter/milestone missing) | Amber badges + Gantt top section | ✅ |
| A10 | **Champion Nudge** (one-click email nudge) | NudgePopover + POST /api/admin/nudge | ✅ |
| A11 | **Weekly reports** (PDF print + week navigation) | @media print + weekly filter | ✅ |
| A12 | Admin mobile UX | Responsive components | ✅ |
| A13 | **1-on-1 (Check-up) Session management** — create sessions, record/upload audio, trigger AI processing, edit meeting notes, manage action items and comments | `/admin/champions/[userId]` — [1-on-1 세션] tab | ✅ (v2.3) |

#### Kanban 5-Column Structure
```
Not started → In progress → Reviewing ──DnD──→ Accepted
                                       ╰──────→ Declined
                                (unidirectional — irreversible after verdict)
```

#### Champion Dashboard Components
| Component | Role |
|---|---|
| `ChampionSummaryTable` | Per-champion charter status, milestone registration, weekly progress grid |
| `ChampionGanttView` | All-champion Gantt (Gantt-only, no view toggle) |
| Action needed section | Top of Gantt — amber cards for charter-missing / milestone-missing champions, fold/unfold |

#### Champion Nudge — 2 Triggers
| Trigger | Location | Nudge type |
|---|---|---|
| "Action needed" chip click | Charter-missing subsection | `no_charter` |
| "Action needed" chip click | Milestone-missing subsection | `no_milestone` |
| Gantt delayed bar click | Gantt chart | `delayed_milestone` |

#### Nudge Email Types (3 types)
| Type | Subject |
|---|---|
| `no_charter` | `[AX] 과제정의서 제출을 기다리고 있습니다 🙏` |
| `no_milestone` | `[AX] 마일스톤 등록을 기다리고 있습니다 🙏` |
| `delayed_milestone` | `[AX] '{{title}}' 마일스톤을 확인해주세요 🙏` |

### 4.3 1-on-1 (Check-up) Session

Weekly 1-on-1 sessions between Admin and Champion are recorded, transcribed, and summarized automatically. The feature covers the full lifecycle: audio capture → AI processing → structured meeting notes with action items → Champion read-access with completion tracking and comments.

#### 4.3.1 Overview
| Actor | Actions |
|---|---|
| Admin | Create session, record audio in-browser or upload file, trigger AI processing / reprocess, edit meeting notes (markdown), manage action items (add / edit / delete / complete), comment |
| Champion | View session list and detail (read-only notes), toggle action item completion, add comments |

#### 4.3.2 Admin User Flow
```
/admin/champions/[userId] → [1-on-1 세션] tab
  ↓
[새 세션 만들기] → session created with session_date + session_time from click timestamp (KST)
  ↓
Record in-browser (32 kbps mono Opus webm) or upload file (wav/mp3/m4a/webm, ≤ 25 MB)
  → drag/drop zone supported
  ↓
Client requests signed upload URL (POST /api/sessions/[id]/upload-url)
  → uploads directly to Supabase Storage (PUT signed URL) — bypasses Vercel 4.5 MB body limit
  ↓
POST /api/sessions/[id]/process { audioFilePath }
  → atomic status claim (409 if already processing)
  → transcribing (Whisper whisper-1, ko) → summarizing (Claude claude-sonnet-4-6, JSON)
  → notes + action items saved to DB
  ↓
Notes rendered in markdown viewer; admin may click [수정] to edit (tiptap + toolbar)
  → PATCH /api/sessions/[id] with expectedUpdatedAt (optimistic concurrency — 409 on conflict)
  → save → read-only view
  ↓
Action items: inline text edit / complete toggle / delete
Comments: admin or champion authorship, displayed by author_role
```

#### 4.3.3 Champion User Flow
```
/(champion)/my-project/sessions → session list (Link-based rows, prefetch, empty state)
  ↓
Click row → session detail
  ├─ Read meeting notes (react-markdown)
  ├─ Toggle action item is_completed
  └─ Add / view comments
```

#### 4.3.4 Audio Pipeline
| Step | Detail |
|---|---|
| Input formats | Browser recording: 32 kbps mono Opus webm. File upload: wav / mp3 / m4a / webm, ≤ 25 MB |
| Upload path | Client → signed URL (`createSignedUploadUrl`) → Supabase Storage `check-up-sessions` bucket (private). Server receives file path only — **Vercel 4.5 MB function-body limit bypassed** |
| Transcription | OpenAI `whisper-1`, language `ko`; safe up to ~100 min at 32 kbps |
| Summarization | Claude `claude-sonnet-4-6`; output JSON `{ notes: string, actionItems: string[] }` |
| Code location | `lib/audio-pipeline/` (transcribe / summarize / costs / notes / process) + `lib/sessions/processAudio.ts` orchestration |
| Route timeout | `maxDuration = 300` on `/api/sessions/[id]/process` and `/reprocess` |
| Processing lock | Atomic status claim at process/reprocess start; concurrent requests → **409** |

`processing_status` state machine:
```
idle → uploading (client) → transcribing → summarizing → done
                                                       ↘ error
```

#### 4.3.5 Meeting Notes
- **Storage format**: markdown (PostgreSQL `TEXT`).
- **Editor**: tiptap + `tiptap-markdown` extension. Toolbar: bold / italic / strikethrough / heading 1–3 / bullet list / numbered list / blockquote / code.
- **Read / edit toggle**: sessions with no saved notes (e.g., mid-recording) open in edit view by default; sessions with saved notes show read-only + **[수정]** button. Saving returns to read-only.
- **Optimistic concurrency**: PATCH sends `expectedUpdatedAt` (last-known `updated_at`). Server rejects with **409** if `updated_at` has changed ("다른 관리자가 먼저 수정했습니다"). After processing/reprocessing, client re-syncs `updated_at`.
- **LLM note structure**: AI summarization preserves user hand-written notes.
  ```
  [User notes]
  ---
  🤖 AI 요약
  [AI summary]
  ```
  On reprocess: user section is preserved; only the AI section is replaced (regex split, robust to editor markdown round-trip).

#### 4.3.6 Session Creation & Metadata
- `session_date` and `session_time` (HH:mm) are set automatically to the **admin's local (KST) time at the moment of clicking [새 세션 만들기]** — no manual datetime input.
- Session list and detail display `date HH:mm`.
- `session_time` is a nullable `TIME` column added in v2.3.

#### 4.3.7 Action Items
| Actor | Allowed actions |
|---|---|
| Admin | Add, inline text edit (PATCH body), complete toggle, delete |
| Champion | Complete toggle only |

#### 4.3.8 Comments
- Both admin and champion can post comments.
- **Bug fix (v2.3)**: POST comment no longer joins `public.users` for author — admins are not in `public.users`, which previously caused 500 errors. Author display uses `author_role` fallback ("관리자" / "챔피언").

#### 4.3.9 Recording Stop Button Label
The in-browser recording stop button label was updated for clarity:

| Before | After |
|---|---|
| 녹음 종료 & 처리 | 녹음 종료 & AI 요약 |

#### 4.3.10 Recorded Session: Download Area vs. Record/Upload Panel
The session detail page conditionally shows either the record/upload panel or a download area based on whether audio has been recorded.

| Session state | `audio_file_path` | UI shown |
|---|---|---|
| New session (no audio) | `null` | Record/upload panel ([녹음하기 / 파일 올리기 / 녹음 시작]) |
| Recorded session (audio exists) | set | **Download area** (record/upload panel fully hidden) |

**Download area — 3 download buttons (when `audio_file_path` is set)**

| Item | Source | Mechanism | Visibility |
|---|---|---|---|
| Audio file | Supabase Storage | `GET /api/sessions/[sessionId]/audio-url` → signed URL | Always |
| Transcript (`.txt`) | `raw_transcript` column | Client-side Blob | Only when `raw_transcript` exists; otherwise shows "no transcript" message |
| AI summary (`.md`) | `notes` column (markdown) | Client-side Blob | Only when `notes` exists |

#### 4.3.11 Session Title Inline Edit
The session detail page header supports in-place title editing.

| Step | Behavior |
|---|---|
| 1 | Click pencil (✏️) button next to title → inline text input activates |
| 2 | Edit title, then click Save (or press Enter) |
| 3 | `PATCH /api/sessions/[sessionId]` with `{ title, expectedUpdatedAt }` |
| 4 | Optimistic concurrency: server returns **409** if `expectedUpdatedAt` does not match current `updated_at` |
| 5 | On success: inline edit mode exits, new title is displayed |

#### 4.3.12 Admin Champion Detail UI Enhancements (v2.3)
- Default tab on `/admin/champions/[userId]` is **[과제정의서]**.
- **[과제정의서 보기]** button rendered as outlined style.
- Milestone name **hover tooltip** shows full name on overflow.
- Scrolling header collapses from 3-line `[Champion name / team / project]` to a **compact sticky bar** `[Champion | Project]`.
- Audio upload area supports **drag-and-drop**.

### 4.4 Email Notification Matrix (9 Triggers)
| # | Trigger Event | Recipient | Function |
|---|---|---|---|
| E1 | Champion final submission | Admin | `notifyNewSubmission` |
| E2 | Champion deadline change request | Admin | `notifyDeadlineChangeRequest` |
| E3 | Champion comments on submission | Admin | `notifyNewComment` |
| E4 | Admin comments on submission | Champion | `notifyNewComment` |
| E5 | Champion comments on Charter | Admin | `notifyNewComment` |
| E6 | Admin replies on Charter | Champion | `notifyNewComment` |
| E7 | Champion submits delay report | Admin | `notifyBottleneck` |
| E8 | Delay report email link (→ /admin/delay-reports) | — | Link updated |
| E9 | Admin nudge (3 types) | Champion | `nudgeChampion` |

---

## 5. User Flows

### 5.1 End-to-End — Champion Journey
```
Entry → Google OAuth → Task list
  ↓
Charter (6 sections) → draft or publish
  ↓
WBS milestones (depth-0 groups → depth-1 milestones) → Gantt
  ↓
Executing...
  ├─ Weekly check-in: complete / delay / extend / in-progress
  ├─ start_date expired + not_started → start+end change modal
  └─ Deadline insufficient → deadline change request → (E2 admin email)
  ↓
Final submission → (E1 admin email) → status: reviewing
  ↓
Admin Kanban DnD → accepted or declined
  └─ Declined → comment feedback → (E4 champion email) → resubmit
```

### 5.2 Admin Daily Flow
```
Open /admin → ChampionGanttView + "Action needed" section
  ├─ Click action-needed chip → NudgePopover → "Nudge 📧" → E9 champion email
  └─ Click Gantt delayed bar → NudgePopover → "Nudge 📧" → E9 champion email
  ↓
/admin/delay-reports → text response + mark resolved
  ↓
/admin/reports → weekly report (week navigation) → PDF print
  ↓
/admin/kanban → DnD card → accepted / declined
```

### 5.3 Security Gateway
```
Browser ──X──→ Supabase DB (blocked: RLS DENY ALL)
Browser ──O──→ Next.js API Routes (verifyJWT + verifyAdmin)
                        ↓ service_role key
                   Supabase DB / Storage
```

---

## 6. Data Model

### 6.1 Core Tables (12)
| Table | Role | Key Columns |
|---|---|---|
| `users` | All users (champions + admins) | id(PK), email, name, avatar_url |
| `homeworks` | Admin-created tasks | id(PK), title, description, due_date, publish_status |
| `submissions` | Champion final submissions | id(PK), user_id, homework_id, file_path, status(pending·accepted·declined), attempt_number |
| `comments` | Submission comments | id(PK), submission_id, body, author_role, author_id |
| `charter_submissions` | Champion task definition docs | id(PK), user_id, homework_id, project_name, content(jsonb 6 sections), publish_status |
| `charter_comments` | Charter comments/replies (max depth 2) | id(PK), charter_submission_id, parent_id, body, author_role, is_resolved |
| `milestones` | Champion WBS items (**2-depth tree**) | id(PK), user_id, homework_id, **parent_milestone_id**(FK→self), week_number, start_date?, due_date?, status, publish_status, bottleneck_type, **source**(manual·ai·template, v2.2) |
| `deadline_change_requests` | Deadline extension requests | id(PK), milestone_id, user_id, original_due_date, requested_due_date, status(pending·approved·rejected) |
| `bottleneck_replies` | Admin responses to delay reports | id(PK), milestone_id, admin_id, body |
| `check_up_sessions` | 1-on-1 session records | id(PK), champion_user_id, admin_user_id, session_date, **session_time**(TIME nullable), title, notes(markdown), audio_file_path, recording_duration_sec, processing_status, raw_transcript, created_at, updated_at |
| `session_action_items` | Action items per session | id(PK), session_id(FK→check_up_sessions CASCADE), body, is_completed, completed_at, display_order, created_at, updated_at |
| `session_comments` | Comments per session | id(PK), session_id(FK→check_up_sessions CASCADE), body, author_id(FK→auth.users CASCADE), author_role(admin\|champion), created_at, updated_at |

> **v2.0 change**: `sub_tasks` table removed → consolidated into `milestones.parent_milestone_id`.
> `milestone_deliverables` table removed (deliverable attachment simplified).
> **v2.3 change**: +3 tables for 1-on-1 session feature (`check_up_sessions`, `session_action_items`, `session_comments`).

### 6.1.1 check_up_sessions — Key Constraints
- `admin_user_id` FK → `auth.users(id)` ON DELETE SET NULL (individual admin attribution).
- `champion_user_id` FK → `users(id)` ON DELETE CASCADE.
- `processing_status` CHECK IN (`idle`, `uploading`, `transcribing`, `summarizing`, `done`, `error`), default `idle`.
- INDEX on `(champion_user_id, session_date DESC)`.
- RLS: champion can SELECT own rows; admin has ALL.

### 6.1.2 Storage Buckets (2)
| Bucket | Visibility | Contents |
|---|---|---|
| `submissions` | Private | Champion final submission files |
| `check-up-sessions` | Private | Session audio files (`sessions/{id}/audio.{ext}`) |

Admin RLS: ALL on `check-up-sessions`. Champions upload via server-issued signed URLs only.

### 6.2 Milestone Auto Status Calculation (server-side, priority order)
| Priority | Status | Condition |
|---|---|---|
| 1 | `completed` | `is_manual_completed = true` |
| 2 | `delayed` | `bottleneck_type IS NOT NULL` |
| 3 | `in_progress` | `is_manual_progress = true` (date-independent) |
| 4 | `delayed` | `due_date < today` (no other condition met) |
| 5 | `not_started` | All else |

> **v2.0 change**: `in_progress` milestones move to in-progress section regardless of dates. `not_started` milestones past `start_date` move to delayed section.

### 6.3 "Action Needed" Champion Detection
| Case | Condition |
|---|---|
| Charter not submitted | `charterSubmissionId === null` |
| Charter submitted, no milestones | `charterSubmissionId !== null` AND `milestones.length === 0` |

### 6.4 Security Model (Defense-in-Depth)
| Layer | Policy |
|---|---|
| Network | HTTPS only |
| Auth | Supabase JWT (RS256), Google OAuth |
| Authz | `is_admin` metadata + middleware + verifyAdmin |
| DB | **RLS DENY ALL** (all tables/buckets) |
| Server | service_role key (server env vars only) |
| Nudge API | verifyJWT + `user_metadata.is_admin` check |

---

## 7. Tech Stack

### 7.1 Production Dependencies (key)
| Library | Version | Purpose |
|---|---|---|
| next | 14.2.35 | App Router |
| react | ^18 | UI |
| tailwindcss | ^3.4.1 | Styling |
| shadcn/ui (Radix) | — | Dialog, Sheet, AlertDialog, etc. |
| FLO Design System 1.0 | — | CSS variables, typography, color tokens (Pretendard) |
| @tiptap/react | ^3.23.4 | Charter WYSIWYG |
| @dnd-kit/core | ^6.3.1 | Kanban DnD |
| @supabase/supabase-js | ^2.105.4 | DB / Auth client |
| nodemailer | ^8.0.7 | Email |
| docx | ^9.6.1 | Charter export |
| gantt-task-react | ^0.3.9 | WBS visualization |
| sonner | ^2.0.7 | Toast UI |
| ai (Vercel AI SDK) | v6 | `generateText` + `Output.object` — Charter-grounded milestone generation |
| @ai-sdk/anthropic | ^3 | Anthropic provider (Claude `claude-haiku-4-5` / `claude-sonnet-4-6`) — direct connection |
| zod | ^4 | AI structured-output schema validation |
| openai | — | Whisper STT (`whisper-1`) for 1-on-1 session audio transcription |
| tiptap-markdown | — | Markdown I/O extension for meeting notes tiptap editor |
| react-markdown + remark-gfm | — | Read-only markdown rendering of meeting notes |

### 7.2 Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     # server-side only
SUPABASE_SERVICE_KEY          # admin provisioning script (create-admins.ts)
GMAIL_USER
GMAIL_APP_PASSWORD
ADMIN_NOTIFICATION_EMAIL
APP_BASE_URL
ANTHROPIC_API_KEY             # milestone AI generation + session summarization (server-only)
MILESTONE_AI_MODEL            # optional, default claude-haiku-4-5
OPENAI_API_KEY                # Whisper STT for 1-on-1 session audio (server-only)
```

### 7.3 Deployment
- **Runtime**: Docker (Next.js standalone) + Jenkins CD
- **CI**: GitHub Actions — `bun lint` · `typecheck` · `build` on PR and main push
- Details: [`docs/deployment/docker.md`](deployment/docker.md)

---

## 8. Current Status & Roadmap

### 8.1 As-Is (2026-06-24)
- ✅ **MVP complete**: Auth, Charter, Milestone (2-depth tree), submissions, Kanban, comments, email (9 triggers)
- ✅ **Admin Dashboard**: ChampionGanttView + ChampionSummaryTable + "Action needed" section
- ✅ **Champion Nudge**: NudgePopover + `/api/admin/nudge` + `nudgeChampion()` (3 types)
- ✅ **Weekly Reports**: PDF print + weekly navigation (Sunday–Saturday)
- ✅ **Mobile UX**: BottomTabBar + DesktopOnlyNotice + card layouts for Champion & Admin
- ✅ **Check-in workflow**: 4 actions + delay report admin review
- ✅ **Draft/Publish**: task, Charter, Milestone
- ✅ **CI/CD**: GitHub Actions (Bun) + Dockerfile + Docker Compose + Jenkins
- ✅ **1-on-1 (Check-up) Session** _(v2.3)_: audio pipeline (Whisper + Claude), meeting notes (tiptap markdown), action items, comments, Champion session view
- ✅ **Individual Admin Accounts** _(v2.3)_: 3 individual admin accounts replacing shared account; attribution/audit via `admin_user_id`
- 🚧 **Remaining**: `/progress` (champion progress dashboard) — skeletal only

### 8.2 Roadmap

| Phase | Scope | Priority |
|---|---|---|
| **P0 — Stabilize** | Verdict reversal API, Nudge rate limiting, email error handling | 🔴 Urgent |
| **P1 — Champion Dashboard** | Complete `/progress` | 🟠 High |
| **P2 — Scale** | Multi-admin support, SendGrid/SES migration | 🟡 Medium |
| **P3 — Analytics** | Champion performance dashboard, in-app notification center | 🟢 Low |
| **P4 — Reusability** | White-label, multi-tenant onboarding | 📋 Review |

### 8.3 Backlog
1. Verdict reversal API — mis-verdict recovery (P0 urgent)
2. Nudge rate limiting — prevent duplicate nudges to same champion (P0)
3. Email `fire-and-forget` try-catch wrapping (P0)
4. Gmail 2FA → app password (pre-launch prerequisite)
5. Charter reply Ctrl+Enter shortcut
6. Dark mode support review

---

## 9. Success Metrics (KPI)

### 9.1 Adoption
| Metric | Definition | Target |
|---|---|---|
| Champion WAU | Weekly login + any activity | ≥ 60% of cohort |
| Charter completion rate | submitted_at IS NOT NULL / homeworks per user | ≥ 90% |
| Avg milestones registered | per champion | ≥ 4 |

### 9.2 Operational Efficiency
| Metric | Definition | Target |
|---|---|---|
| Avg review lead time | submitted_at → status change | ≤ 24h |
| Nudge conversion rate | Nudge → charter/milestone within 48h | Monitored |
| Deadline change response time | created_at → reviewed_at | ≤ 12h |

### 9.3 Quality
| Metric | Definition | Target |
|---|---|---|
| Email delivery rate | SMTP success / attempts | ≥ 99% |
| Re-submission rate | declined → resubmitted | Monitored |
| System error rate | 5xx / total requests | ≤ 0.1% |

---

## 10. Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Gmail SMTP daily limit (500/day) | Medium | Medium | SendGrid/SES migration (P2) |
| R2 | ~~Single admin mailbox routing~~ | — | — | **Resolved v2.3** — 3 individual admin accounts |
| R3 | Unidirectional DnD mis-verdict | Medium | High | Admin-only verdict reversal API (P0) |
| R4 | Nudge spam — no rate limit | Medium | Medium | Same-champion rate limiting (P0) |
| R5 | Fire-and-forget email unhandled rejection | Medium | Low | try-catch + error logging (P0) |
| R6 | Charter content jsonb schema migration | Low | Medium | Version field + incremental migration |
| R7 | Champion email blocked → alert loss | Medium | Medium | In-app notification center (P3) |
| R8 | Gmail App Password exposure | Low | High | Server env var isolation, rotation, SendGrid |
| R9 | Audio processing timeout (>100 min sessions) | Low | Medium | processing_status=error + reprocess; `maxDuration=300` |
| R10 | OpenAI/Anthropic API cost at scale | Medium | Medium | `lib/audio-pipeline/costs` usage tracking; budget alerts |

---

## 11. Appendix

### A. Route Quick Reference
```
Champion:                            Admin:
  /                                    /admin
  /my-project/charter                  /admin/homework/[id]
  /my-project/milestones               /admin/homework/new
  /my-project/sessions                 /admin/kanban
  /my-project/sessions/[id]            /admin/requests
  /progress                            /admin/delay-reports
  /login                               /admin/reports
                                       /admin/champions/[userId]  ← [1-on-1 세션] tab
                                       /admin/login
```

### B. API Endpoint Count
| Group | Endpoints | Auth |
|---|---|---|
| Champion API | 16 | verifyJWT |
| Admin API | 14 | verifyJWT + verifyAdmin |
| Session API | 11 | verifyJWT (+ verifyAdmin for write ops) |
| Auth | 1 | OAuth callback |
| **Total** | **42** | — |

> v1.1 → v2.0: +4 endpoints (milestone tree, /api/admin/nudge, /api/admin/delay-reports, gantt improvements)
> v2.2 → v2.3: +11 session endpoints (POST/GET /api/sessions; GET/PATCH/DELETE /api/sessions/[id]; upload-url, audio-url, process, reprocess; action-items CRUD; comments CRUD)

### C. Reference Documents
- `docs/ERD.md` — Data model detail
- `docs/PRD-KO.md` — Korean PRD + WBS effort table
- `DESIGN.md` — FLO Design System implementation guide
- `docs/deployment/docker.md` — Docker/Jenkins deployment guide
- `README.md` — Local setup / env var guide

---

**Version History**
| Version | Date | Changes |
|---|---|---|
| v2.3 | 2026-06-24 | 1-on-1 (Check-up) Session feature (audio pipeline, meeting notes, action items, comments, Champion view); individual admin accounts (3 accounts, shared account deprecated); +3 DB tables; +2 Storage buckets noted; +10 API endpoints |
| v2.2 | 2026-06-16 | Smart Milestone Input (C15) — AI generate / template / direct, batch save |
| v2.0 | 2026-06-02 | Milestone 2-depth tree, Champion Nudge, Weekly Reports, Mobile UX, Check-in workflow |
| v1.1 | 2026-05-21 | Initial internal review release |

**Document metadata**
- Author: yr.park@dreamus.io
- Review: Strategy Lead 1x + Eng Lead 1x
- Next Update: After P0 stabilization and `/progress` completion
