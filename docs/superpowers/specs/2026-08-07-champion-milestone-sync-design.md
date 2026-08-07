# Champion Milestone Sync — Design

**Status:** Approved (fast-track — user requested no per-section confirmation past this point)
**Author:** Claude (with yr.park@dreamus.io)
**Date:** 2026-08-07

## 1. Problem

Champions stop checking their milestone progress on this site and ignore email nudges. Instead of pulling them back to the website, we bring milestone sync to where they already work: their local Claude Code session. When a champion finishes a coding session on their own project (e.g. CIS), they call a Claude Code skill that reads the conversation, figures out which of their milestones the work relates to, and updates progress + a dated activity note on this site — no website visit required.

## 2. Architecture

```
Champion's local machine                     ax-homework-submission (this app)
┌───────────────────────┐                    ┌────────────────────────────────┐
│ Claude Code session     │                    │ POST /api/pairing/request        │
│ (any project, e.g. CIS) │  ①no token yet      │ GET  /pairing?code=XXX (page)    │
│                         │──pairing──────────▶│ POST /api/pairing/approve        │
│ champion-milestone-sync │◀─②token────────────│ GET  /api/pairing/poll           │
│ skill                   │                    │                                  │
│ ~/.ax-milestone-sync/   │  ③Bearer PAT        │ GET  /api/milestones (existing) │
│ config.json             │──every call───────▶│ POST /api/milestones/[id]/log    │
└───────────────────────┘                    │ (new)                            │
                                               │                                  │
                                               │ DB: device_pairing_codes         │
                                               │     personal_access_tokens       │
                                               │     milestone_activity_log       │
                                               └────────────────────────────────┘
```

The skill uses the **current conversation as its data source** — no external log parsing. It summarizes what happened in the session itself.

## 3. Data model (new migration)

```sql
CREATE TABLE device_pairing_codes (
  code text PRIMARY KEY,
  user_id uuid REFERENCES auth.users,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','expired')),
  issued_token text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE personal_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  token_hash text NOT NULL UNIQUE,
  label text,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE milestone_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid REFERENCES milestones NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  note text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

`milestones.note` (existing single column) stays as the manual/website-editable note. The skill only ever writes to `milestone_activity_log`.

## 4. Pairing auth flow

| Endpoint | Auth | Behavior |
|---|---|---|
| `POST /api/pairing/request` | none | Generates a 6-char code (`7X4K9P`), inserts `device_pairing_codes` row with 10-min `expires_at`. Returns `{code, expires_at}`. Rate-limited per IP (e.g. 10/hour) to blunt brute-force guessing of codes. |
| `GET /pairing?code=XXX` | champion session (redirects to Google login if absent) | Shows "이 기기를 연결할까요?" with a single confirm button. |
| `POST /api/pairing/approve` | `requireUser` | Generates a random PAT (`amst_` + 32 random bytes, base62), stores `sha256(token)` in `personal_access_tokens` (label auto-derived, e.g. `"Paired 2026-08-07"`), writes the plaintext once into `device_pairing_codes.issued_token`, sets `status='approved'`. Attempt-limited per code. |
| `GET /api/pairing/poll?code=XXX` | none | While `pending`, returns `{status:'pending'}`. On `approved`, returns `{status:'approved', token}` **and immediately nulls `issued_token`** so it can't be read twice. On expiry, `{status:'expired'}`. |

**Auth guard extension (`lib/auth.ts`):** `verifyJWT` tries Supabase JWT verification first; on failure, if the bearer token starts with `amst_`, hash it and look up `personal_access_tokens` (checking `revoked_at is null`), update `last_used_at`, and return a minimal `User`-shaped object with the resolved `id`. This means `requireUser`/`requireAdmin` and every existing route built on them (`/api/milestones`, `/api/milestones/[id]`) work with PATs with **zero route-level changes**. PATs never pass `isAdminUser` (no `app_metadata`), which is correct — champions only, not admins.

**Security:**
- PATs stored as sha256 hash only; plaintext shown/transmitted exactly once (pairing approval → poll response → local config file).
- Champion-facing settings page gets a minimal "연결된 기기" list (label, last_used_at, revoke button) — reuses existing settings surface if one exists, otherwise a small new section under `/my-project`.
- No token expiry (matches "set once, keep working" UX goal); revocation is manual, from the site.

## 5. Skill behavior (`champion-milestone-sync`)

**Trigger:** explicit champion request in a Claude Code session — SKILL.md description matches phrases like "마일스톤 업데이트", "오늘 작업 기록해줘", "milestone sync".

1. **Auth check** — read `~/.ax-milestone-sync/config.json`. If missing/invalid: call `POST /api/pairing/request`, show the champion the code + pairing URL (open browser if possible), poll `GET /api/pairing/poll` up to 5 minutes, save the returned token to config on success.
2. **Fetch milestones** — `GET /api/milestones` with the PAT, filter to `publish_status === 'published'`. If empty, tell the champion no milestones exist yet and stop (no write).
3. **Match** — the model (this session) summarizes what was actually done and compares against milestone titles/descriptions, selecting 0–N relevant candidates. Zero matches → say so, do nothing.
4. **Confirm** — present all candidates at once as a single list ("이 작업들을 기록할까요?"). For any candidate the model judges as fully done, ask a **separate, explicit** yes/no ("이 마일스톤을 완료로 표시할까요?") — never bundle completion into the general confirmation.
5. **Write** — for each confirmed candidate, `POST /api/milestones/[id]/log` (new endpoint) with `{note, log_date, mark_in_progress: true, mark_completed?: true}`. Server inserts the activity log row and, in the same request, applies the equivalent of the existing `is_manual_progress`/`is_manual_completed` PATCH logic (reusing the current guard checks — e.g. charter-approval gate — so this endpoint composes with, not bypasses, existing rules).
6. **Report** — short confirmation summary per milestone updated.

## 6. Error handling / edge cases

- Pairing not approved within 5 minutes → stop polling, tell champion how to retry.
- PAT revoked server-side (401 on any call) → skill deletes local config and restarts the pairing flow automatically.
- Network/API failure → one retry, then fail with a clear message; nothing local is corrupted (config write only happens after a fully successful pairing).
- Session content unrelated to any milestone (e.g. small talk) → skip silently, no write, no forced confirmation prompt.
- One session touching multiple milestones → batched into the single confirmation + multiple log calls.
- Work detected on an already-completed milestone → skill only ever offers to add a log entry, never un-completes a milestone (that stays a website-only action).

## 7. Scope / out of scope

In scope for the implementation plan:
- Migration (3 tables above)
- Auth guard extension for PATs
- Pairing endpoints + `/pairing` page
- `POST /api/milestones/[id]/log` endpoint
- Minimal "연결된 기기" revoke UI
- `champion-milestone-sync` skill artifact (SKILL.md + any helper script for pairing/HTTP calls)

Out of scope (explicitly deferred):
- Registering the skill on the Dreamus internal skill hub (dreamus-skill-sync) — later, separate task.
- Slack bot / email-based sync (alternatives the user is still weighing, not committed).
- Any change to `milestones.note` or existing milestone UI beyond what's listed above.

## 8. Testing

- Unit tests: PAT hashing/lookup in `lib/auth.ts`, pairing code generation/expiry, the new log endpoint's request/response shape and its reuse of existing progress/completion guards.
- Integration-style test for the full pairing round trip (request → approve → poll) using the existing test patterns in `test/`.
- Manual verification of the skill flow against a local dev server (no automated test for the conversational matching itself — that's a prompting concern, not a unit-testable one).
