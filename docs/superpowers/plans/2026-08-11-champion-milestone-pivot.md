# champion-milestone-sync Pivot Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `champion-milestone-sync` handle a pivot — when today's session matches zero existing milestones, offer to delete now-irrelevant milestones and propose/create a new one, instead of just stopping.

**Architecture:** No new API routes, no new DB tables, no new auth scope. Everything needed (`GET /api/milestones/[id]/log`, `POST /api/milestones`, `DELETE /api/milestones/[id]`) already exists and is already callable with the champion's existing `amst_` PAT. This plan adds three thin CLI commands to `skills/champion-milestone-sync/scripts/pairing-client.mjs` and a new documented sub-flow in `skills/champion-milestone-sync/SKILL.md`.

**Tech Stack:** Node 18+ (global `fetch`), the repo's existing pairing-client.mjs conventions (no dependencies, `authedFetch` wrapper, JSON-line stdout).

## Global Constraints

- Never touch `charter_submissions` in any part of this feature — pivot handling operates on milestones only. (spec §2)
- Deleting a milestone cascades its `milestone_activity_log` rows permanently (`ON DELETE CASCADE`) — the champion must see the log count before confirming deletion, every time, no exceptions. (spec §4)
- Deleting a milestone with sub-milestones does not delete them (`parent_milestone_id` is `ON DELETE SET NULL`) — they become top-level. The confirmation message must say this when it applies. (spec §4)
- New milestones are created with `publish_status: 'published'` (not draft). (spec §5 step 4)
- Deletion and creation are two fully independent confirmations — declining one must never skip or auto-decide the other. (spec §5 steps 2–3)
- The "propose a new milestone" step always runs after a pivot is detected, even if the champion declined every deletion or pointed to nothing to delete. (spec §5 step 1, step 3)

---

### Task 1: Add `milestone-log`, `create-milestone`, `delete-milestone` commands to pairing-client.mjs

**Files:**
- Modify: `skills/champion-milestone-sync/scripts/pairing-client.mjs`

**Interfaces:**
- Consumes: existing `authedFetch(path, options)` helper (already in the file) — handles auth header injection, 401 token-clear-and-throw, and non-2xx throw.
- Produces (for Task 2's SKILL.md to reference by exact CLI syntax):
  - `node <skill_dir>/scripts/pairing-client.mjs milestone-log <milestone_id>` → prints `{"logs": [...]}` (array of `{id, milestone_id, user_id, log_date, note, created_at}`)
  - `node <skill_dir>/scripts/pairing-client.mjs create-milestone "<title>" [--description="<description>"]` → prints `{"milestone": {...}, "parentUpdated": null}` — the new milestone's id is at `.milestone.id`
  - `node <skill_dir>/scripts/pairing-client.mjs delete-milestone <milestone_id>` → prints `{"parentUpdated": null}` on success

- [ ] **Step 1: Add the three async command functions**

  Insert immediately after the existing `logMilestone` function (after its closing `}`, before `function parseLogArgs`):

  ```javascript
  async function listMilestoneLog(id) {
    const result = await authedFetch(`/api/milestones/${id}/log`)
    console.log(JSON.stringify(result))
  }

  async function createMilestone(title, opts) {
    const result = await authedFetch('/api/milestones', {
      method: 'POST',
      body: JSON.stringify({
        title,
        description: opts.description,
        publish_status: 'published',
      }),
    })
    console.log(JSON.stringify(result))
  }

  async function deleteMilestone(id) {
    const result = await authedFetch(`/api/milestones/${id}`, { method: 'DELETE' })
    console.log(JSON.stringify(result))
  }
  ```

- [ ] **Step 2: Add argument parsing for `create-milestone`**

  Insert immediately after the existing `parseLogArgs` function (after its closing `}`, before `async function main`):

  ```javascript
  function parseCreateMilestoneArgs(argv) {
    const [title, ...rest] = argv
    if (!title) {
      console.error('usage: create-milestone <title> [--description="..."]')
      process.exit(1)
    }
    const opts = { description: undefined }
    for (const arg of rest) {
      if (arg.startsWith('--description=')) opts.description = arg.slice('--description='.length)
    }
    return { title, opts }
  }
  ```

- [ ] **Step 3: Wire the three commands into `main()`'s dispatch**

  In `main()`, the current dispatch reads:

  ```javascript
  async function main() {
    const [, , command, ...rest] = process.argv
    try {
      if (command === 'ensure-paired') await ensurePaired()
      else if (command === 'list-milestones') await listMilestones()
      else if (command === 'log-milestone') {
        const { id, note, opts } = parseLogArgs(rest)
        await logMilestone(id, note, opts)
      } else {
        console.error('usage: pairing-client.mjs <ensure-paired|list-milestones|log-milestone>')
        process.exit(1)
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  }
  ```

  Replace it with (adds three `else if` branches before the final `else`, and extends the usage string):

  ```javascript
  async function main() {
    const [, , command, ...rest] = process.argv
    try {
      if (command === 'ensure-paired') await ensurePaired()
      else if (command === 'list-milestones') await listMilestones()
      else if (command === 'log-milestone') {
        const { id, note, opts } = parseLogArgs(rest)
        await logMilestone(id, note, opts)
      } else if (command === 'milestone-log') {
        const [id] = rest
        if (!id) {
          console.error('usage: milestone-log <milestone_id>')
          process.exit(1)
        }
        await listMilestoneLog(id)
      } else if (command === 'create-milestone') {
        const { title, opts } = parseCreateMilestoneArgs(rest)
        await createMilestone(title, opts)
      } else if (command === 'delete-milestone') {
        const [id] = rest
        if (!id) {
          console.error('usage: delete-milestone <milestone_id>')
          process.exit(1)
        }
        await deleteMilestone(id)
      } else {
        console.error(
          'usage: pairing-client.mjs <ensure-paired|list-milestones|log-milestone|milestone-log|create-milestone|delete-milestone>',
        )
        process.exit(1)
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  }
  ```

- [ ] **Step 4: Syntax-check the script**

  Run: `node --check skills/champion-milestone-sync/scripts/pairing-client.mjs`
  Expected: no output, exit code 0 (this repo's established verification method for this file — it has no unit test suite; it's a thin HTTP wrapper that needs a live pairing to exercise for real, same as `mcp-connect.mjs` in `skills/obsidian-session-sync/`).

- [ ] **Step 5: Manually trace each new command against its route handler**

  This substitutes for automated tests here (matches repo convention for this file). Confirm by reading the source, not by running against a live server:
  - `milestone-log` → `GET /api/milestones/[id]/log` (`app/api/milestones/[id]/log/route.ts`, restored in PR #70) returns `{ logs: [...] }` on success, `{ error }` with non-2xx on failure. `authedFetch` throws on non-2xx, so a bad id surfaces as a thrown error with the response body text — acceptable, matches how `log-milestone` already handles its own failures.
  - `create-milestone` → `POST /api/milestones` (`app/api/milestones/route.ts`) requires `title` when `publish_status: 'published'` (this command always sends `'published'`) — if title is empty the route 400s with `validation_failed`; the command's own arg parser already refuses to run with no title, so this route-level check is a backstop, not the primary guard.
  - `delete-milestone` → `DELETE /api/milestones/[id]` (`app/api/milestones/[id]/route.ts`) scopes by `.eq('user_id', user.id)`, so a champion can only delete their own milestones; returns `{ parentUpdated }` with HTTP 200 on success (not 204 — `authedFetch`'s unconditional `res.json()` is safe here, no need for a 204 guard).

- [ ] **Step 6: Commit**

  ```bash
  git add skills/champion-milestone-sync/scripts/pairing-client.mjs
  git commit -m "$(cat <<'EOF'
  [AX-1] feat(skill): champion-milestone-sync에 milestone-log/create-milestone/delete-milestone 명령 추가

  pivot 지원(SKILL.md 다음 태스크)이 쓸 CLI 명령 3개 선행 추가.
  전부 기존 authedFetch로 챔피언 PAT 인증 재사용, 새 API/스코프 없음.

  Co-authored-by: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 2: Document the pivot-handling flow in SKILL.md

**Files:**
- Modify: `skills/champion-milestone-sync/SKILL.md`

**Interfaces:**
- Consumes: the three CLI commands from Task 1 (`milestone-log <id>`, `create-milestone "<title>" [--description="..."]`, `delete-milestone <id>`) — exact syntax as produced above.
- Produces: nothing consumed by a later task — this is the last task in the plan.

- [ ] **Step 1: Update step 3 ("Match") to hand off to the new section instead of just stopping**

  Find this exact text in the `## Steps` section:

  ```markdown
  3. **Match.** Using your own understanding of what happened in this conversation (not the script),
     compare the actual work done against the milestone titles/descriptions. Select zero, one, or
     several milestones that the session's work genuinely relates to. If nothing matches, say so and
     stop — never force a match.
  ```

  Replace with:

  ```markdown
  3. **Match.** Using your own understanding of what happened in this conversation (not the script),
     compare the actual work done against the milestone titles/descriptions. Select zero, one, or
     several milestones that the session's work genuinely relates to. Never force a match. If
     nothing matches, this may be a pivot — go to **"Handling a pivot"** below instead of continuing
     to step 4.
  ```

- [ ] **Step 2: Insert the new "Handling a pivot" section**

  Insert a new `##` section immediately after step 6 ("Report.") of the `## Steps` list and before the `## Notes` section. The exact text to insert:

  ```markdown
  ## Handling a pivot (no milestone matches)

  Triggered only from step 3 above, when matching found zero milestones. Never touches the
  champion's charter (`charter_submissions`) — a pivot is handled at the milestone level only; if
  the champion's charter itself needs revising, that still happens on the site, not here.

  1. **Ask about existing milestones.** Show the champion the milestone list already fetched in
     step 2 and ask: "오늘 작업이 기존 마일스톤 어디에도 안 맞는 것 같습니다. 이 중 이제 더 이상
     유효하지 않은 게 있나요? (없으면 새 마일스톤만 추가할게요)" Never decide yourself that a
     milestone is obsolete — only act on what the champion points to. If they point to nothing,
     skip straight to step 3 below (a new milestone is still proposed).

  2. **Confirm each deletion separately.** For every milestone the champion pointed to:
     - Run `node <skill_dir>/scripts/pairing-client.mjs milestone-log <milestone_id>` and count the
       entries in the returned `logs` array.
     - Check the milestone list already fetched in step 2 of the main flow for any entry whose
       `parent_milestone_id` equals this milestone's `id` (its sub-milestones, if any).
     - Ask, as its own explicit question: "[제목] 마일스톤을 삭제할까요? 활동 로그 N건이 함께
       사라집니다." — append ", 하위 마일스톤 M개는 삭제되지 않고 최상위로 이동합니다." if any
       sub-milestones were found. Deleting is permanent (`ON DELETE CASCADE` on the activity log) —
       the champion must see the count before answering; never guess it or skip the check.
     - Only on an explicit yes, run:
       ```
       node <skill_dir>/scripts/pairing-client.mjs delete-milestone <milestone_id>
       ```
       On "no" (or anything short of a clear yes), leave that milestone untouched and move to the
       next one.

  3. **Propose a new milestone.** Regardless of what happened in step 2 — even if the champion
     deleted nothing, declined every deletion, or wasn't asked because they pointed to nothing —
     draft a title and a one-to-two sentence description from what the session actually did, and
     confirm it as its own question: "새 마일스톤 '[제목]'을(를) 만들까요? — [설명]". This
     confirmation is independent of step 2's — a "no" there never skips this.

  4. **Create it.** On yes:
     ```
     node <skill_dir>/scripts/pairing-client.mjs create-milestone "<title>" --description="<description>"
     ```
     Read the new milestone's id from the result's `milestone.id` field — you need it for step 5.

  5. **Offer to log today's work on it immediately.** Ask: "오늘 작업도 여기에 기록할까요?" On yes,
     run step 5 ("Write") of the main flow above against the newly created milestone's id, exactly
     as you would for a matched milestone — including the separate completion question if
     applicable, and the same `charter_not_approved` handling from step 6 if marking progress fails
     (report that the milestone itself was created successfully even if marking it in-progress
     wasn't — don't let one failure make the whole pivot sound like it failed).

  6. **Report.** One line per action actually taken — each deletion, the new milestone (or that it
     was declined), and whether today's work got logged to it. If the champion declined everything,
     say that plainly rather than a generic "완료".
  ```

- [ ] **Step 3: Add two bullets to the `## Notes` section**

  Find the existing `## Notes` section:

  ```markdown
  ## Notes

  - Never write anything without the explicit confirmation from step 4.
  - Never un-complete a milestone or edit `milestones.note` (the website's own manual note field) —
    this skill only ever adds activity-log entries and optionally moves a milestone from
    not-started/delayed to in-progress or completed.
  - If any call fails with "token no longer valid", the script has already cleared the local config;
    just re-run step 1 to re-pair.
  ```

  Replace with (adds two bullets at the end):

  ```markdown
  ## Notes

  - Never write anything without the explicit confirmation from step 4.
  - Never un-complete a milestone or edit `milestones.note` (the website's own manual note field) —
    this skill only ever adds activity-log entries and optionally moves a milestone from
    not-started/delayed to in-progress or completed.
  - If any call fails with "token no longer valid", the script has already cleared the local config;
    just re-run step 1 to re-pair.
  - Pivot handling (below) never touches a charter (`charter_submissions`) — only milestones. If the
    champion's actual charter direction changed, tell them that's still a site edit, not something
    this skill does.
  - Deleting a milestone is irreversible and takes its entire activity log with it — always show the
    log count and get an explicit yes before calling `delete-milestone`, with no exceptions.
  ```

- [ ] **Step 4: Read the whole file back and verify structure**

  Run: `cat skills/champion-milestone-sync/SKILL.md`
  Expected: `## Steps` (1–6) → `## Handling a pivot (no milestone matches)` (1–6) → `## Notes` (5
  bullets), frontmatter and step 1/2 text unchanged from before this task.

- [ ] **Step 5: Commit**

  ```bash
  git add skills/champion-milestone-sync/SKILL.md
  git commit -m "$(cat <<'EOF'
  [AX-1] docs(skill): champion-milestone-sync pivot 처리 흐름 문서화

  매칭 0건일 때 그냥 멈추는 대신, 안 맞는 기존 마일스톤을 지목받아
  개별 확인 후 삭제하고 새 마일스톤을 제안·생성하는 흐름 추가.
  삭제/생성은 완전히 독립된 확인, charter는 절대 건드리지 않음.

  Co-authored-by: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Plan Self-Review Notes

- **Spec coverage:** §3 scope (charter untouched) → Task 2 step 2 opening line + Notes bullet. §4 cascade/orphan warnings → Task 2 step 2's confirmation message. §5 six-step flow → Task 2 step 2 verbatim. §6 error handling (partial success framing, no blind retry, silent-skip-with-report) → Task 2 step 2 items 2 and 5. §7 testing convention → Task 1 steps 4–5.
- **Type/name consistency check:** `milestone-log`, `create-milestone`, `delete-milestone` command names match exactly between Task 1's `main()` dispatch and every reference in Task 2. `opts.description` (Task 1) matches `--description="..."` (Task 2's usage). `.milestone.id` (Task 1's documented output shape, matching the existing `POST /api/milestones` route's `NextResponse.json({ milestone: data, parentUpdated }, { status: 201 })`) matches what Task 2 step 4 tells the reader to read.
