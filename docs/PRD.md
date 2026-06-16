# AX Homework Submission Platform — PRD

> **Version** 2.2 · **Updated** 2026-06-16 · **Author** yr.park@dreamus.io
> **Status** Internal Review · **Repo** `AX/ax-homework-submission`
> **Previous** v2.0 (2026-06-02) · v1.1 (2026-05-21)

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
2. **Single admin mailbox** — no routing logic for multi-admin setup.
3. **Unidirectional Kanban DnD** — no rollback after accept/reject. Mis-verdict recovery undefined.
4. **Nudge rate limiting absent** — same champion can be nudged repeatedly.

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
Admin    = user_metadata.is_admin === true
```
- All APIs: JWT verification (`verifyJWT`) + admin-only APIs add `verifyAdmin`
- Direct client DB access blocked (Supabase RLS **DENY ALL**)

---

## 3. Solution Overview

### 3.1 System Context
```
┌───────────────────────────────────────────────────────────────────────┐
│  Browser (CSR)                                                        │
│  Champion UI: /my-project/charter, /my-project/milestones, /progress  │
│  Admin UI: /admin, /admin/delay-reports, /admin/reports               │
└──────────────────────┬────────────────────────────────────────────────┘
                       │ HTTPS + JWT
┌──────────────────────▼────────────────────────────────────────────────┐
│  Next.js 14 App Router                                                │
│  middleware.ts (role-based routing) + API Routes (app/api/**)         │
└────────┬─────────────────────────────────────────┬────────────────────┘
         │ service_role key                         │ SMTP
┌────────▼────────────────────────────┐   ┌────────▼──────────┐
│  Supabase (RLS DENY ALL)            │   │  Gmail SMTP       │
│  Auth (Google OAuth)                │   │  (Nodemailer)     │
│  PostgreSQL (9 tables)              │   │  9 triggers       │
│  Storage (submissions bucket)       │   └───────────────────┘
└─────────────────────────────────────┘
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

### 4.3 Email Notification Matrix (9 Triggers)
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

### 6.1 Core Tables (9)
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

> **v2.0 change**: `sub_tasks` table removed → consolidated into `milestones.parent_milestone_id`.
> `milestone_deliverables` table removed (deliverable attachment simplified).

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
| @ai-sdk/anthropic | ^3 | Anthropic provider (Claude `claude-haiku-4-5`) — direct connection |
| zod | ^4 | AI structured-output schema validation |

### 7.2 Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     # server-side only
GMAIL_USER
GMAIL_APP_PASSWORD
ADMIN_NOTIFICATION_EMAIL
APP_BASE_URL
ANTHROPIC_API_KEY             # milestone AI generation (direct Anthropic, server-only)
MILESTONE_AI_MODEL            # optional, default claude-haiku-4-5
```

### 7.3 Deployment
- **Runtime**: Docker (Next.js standalone) + Jenkins CD
- **CI**: GitHub Actions — `bun lint` · `typecheck` · `build` on PR and main push
- Details: [`docs/deployment/docker.md`](deployment/docker.md)

---

## 8. Current Status & Roadmap

### 8.1 As-Is (2026-06-02)
- ✅ **MVP complete**: Auth, Charter, Milestone (2-depth tree), submissions, Kanban, comments, email (9 triggers)
- ✅ **Admin Dashboard**: ChampionGanttView + ChampionSummaryTable + "Action needed" section
- ✅ **Champion Nudge**: NudgePopover + `/api/admin/nudge` + `nudgeChampion()` (3 types)
- ✅ **Weekly Reports**: PDF print + weekly navigation (Sunday–Saturday)
- ✅ **Mobile UX**: BottomTabBar + DesktopOnlyNotice + card layouts for Champion & Admin
- ✅ **Check-in workflow**: 4 actions + delay report admin review
- ✅ **Draft/Publish**: task, Charter, Milestone
- ✅ **CI/CD**: GitHub Actions (Bun) + Dockerfile + Docker Compose + Jenkins
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
| R2 | Single admin mailbox routing | High | Medium | Multi-admin + per-task assignee mapping (P2) |
| R3 | Unidirectional DnD mis-verdict | Medium | High | Admin-only verdict reversal API (P0) |
| R4 | Nudge spam — no rate limit | Medium | Medium | Same-champion rate limiting (P0) |
| R5 | Fire-and-forget email unhandled rejection | Medium | Low | try-catch + error logging (P0) |
| R6 | Charter content jsonb schema migration | Low | Medium | Version field + incremental migration |
| R7 | Champion email blocked → alert loss | Medium | Medium | In-app notification center (P3) |
| R8 | Gmail App Password exposure | Low | High | Server env var isolation, rotation, SendGrid |

---

## 11. Appendix

### A. Route Quick Reference
```
Champion:                            Admin:
  /                                    /admin
  /my-project/charter                  /admin/homework/[id]
  /my-project/milestones               /admin/homework/new
  /progress                            /admin/kanban
  /login                               /admin/requests
                                       /admin/delay-reports
                                       /admin/reports
                                       /admin/champions/[userId]
                                       /admin/login
```

### B. API Endpoint Count
| Group | Endpoints | Auth |
|---|---|---|
| Champion API | 16 | verifyJWT |
| Admin API | 14 | verifyJWT + verifyAdmin |
| Auth | 1 | OAuth callback |
| **Total** | **31** | — |

> v1.1 → v2.0: +4 endpoints (milestone tree, /api/admin/nudge, /api/admin/delay-reports, gantt improvements)

### C. Reference Documents
- `docs/ERD.md` — Data model detail
- `docs/PRD-KO.md` — Korean PRD + WBS effort table
- `DESIGN.md` — FLO Design System implementation guide
- `docs/deployment/docker.md` — Docker/Jenkins deployment guide
- `README.md` — Local setup / env var guide

---

**Document metadata**
- Author: yr.park@dreamus.io
- Review: Strategy Lead 1x + Eng Lead 1x
- Next Update: After P0 stabilization and `/progress` completion
