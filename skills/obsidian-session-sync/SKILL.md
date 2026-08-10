---
name: obsidian-session-sync
description: Use when an admin (usually) or champion wants to sync 1-on-1 check-up session notes and action items between a local Obsidian vault and ax-homework-submission, in either direction. Triggers on "옵시디언 동기화", "세션 노트 동기화", "1on1 노트 싱크", "obsidian sync", "sync session notes".
---

# Obsidian Session Sync

Syncs 1-on-1 meeting notes and action items between a local Obsidian vault and
ax-homework-submission's `check_up_sessions`/`session_action_items` tables, via the
`ax-sessions` MCP server (`app/api/mcp/route.ts`). Usually run by an **admin** syncing several
champions' session notes; a champion can also run it for their own sessions, but creating a
brand-new session in the app requires an admin (matches the site's own rule).

This skill has two parts: the `ax-sessions` MCP server, which does the actual DB reads/writes
through five tools (`whoami`, `list_champions`, `get_session`, `upsert_session`,
`sync_action_items`), and you, the agent, who does everything that requires judgment: reading
and parsing the local Obsidian file, matching it to the right champion/date, diffing it against
the app's current state, and confirming with the human before writing anything on either side.

**Requires `AX_MILESTONE_SYNC_API_URL`** in the environment (shared with champion-milestone-sync)
and the `ax-sessions` MCP server connected. If tool calls like `mcp__ax-sessions__whoami` aren't
available, run `ToolSearch` with `select:mcp__ax-sessions__whoami,mcp__ax-sessions__list_champions,mcp__ax-sessions__get_session,mcp__ax-sessions__upsert_session,mcp__ax-sessions__sync_action_items`
first — MCP servers connected mid-session need this before their tools are callable.

## Setup (one time per machine)

1. Run `claude mcp list` and check whether `ax-sessions` already shows **Connected**. If so,
   skip to Steps below.
2. Otherwise run:
   ```
   node <skill_dir>/scripts/mcp-connect.mjs [--admin]
   ```
   Pass `--admin` when the person running this is an actual site admin and wants the admin-scope
   PAT (needed to sync any champion's sessions and to create new sessions); omit it for a
   champion syncing only their own sessions. The script prints `pairingUrl`/`code`/`instructions`
   — show the `instructions` text verbatim and open `pairingUrl` if you can. It blocks up to 5
   minutes polling for approval, then registers the MCP server itself via `claude mcp add`. On
   success it prints `{"connected": true, ...}`. If it times out or expires, relay that plainly
   and offer to retry from the top.
3. After a fresh connect, the new tools may not appear until the next message — if a
   `mcp__ax-sessions__*` call fails as unknown, tell the human to start a new session and re-invoke
   this skill.

## Direction A: Obsidian → App (the common case)

1. **Identify the note.** Ask which champion and date (or date range) to sync, unless it's
   obvious from context (e.g. the human just opened/mentioned a specific file). Locate that
   champion's session note in their Obsidian vault — ask for the vault/file if you don't already
   know it. Do not guess a champion from a name fragment; confirm if there's any ambiguity.

2. **Parse the file.** Look for a leading HTML comment holding sync IDs, e.g.:
   ```markdown
   # 2026-08-08 김철수 1-on-1
   <!-- session_id: 3f2a1c9e-... champion_id: 8b7d... -->

   ## 노트
   (마크다운 — session.notes)

   ## 액션 아이템
   - [ ] 할 일 1 <!-- id: abc123 -->
   - [x] 할 일 2 <!-- id: def456 -->
   - [ ] 새로 적은 항목 (주석 없음 → 신규 생성 대상)
   ```
   Extract `session_id`/`champion_id` if present, the notes body, and the action item list (each
   with its checkbox state and optional `<!-- id: ... -->`).

3. **Resolve the champion.** If `champion_id` isn't cached in the file yet, call
   `mcp__ax-sessions__list_champions` (admin-only — returns `admin_required` for a champion PAT,
   which is fine, skip this step for champion callers who always act as themselves) to map the
   champion's name to a `user_id`. Suggest writing that id into the file's HTML comment so future
   runs skip this lookup.

4. **Fetch current app state.** Call `mcp__ax-sessions__get_session` with the date (and
   `champion_user_id` for admin callers). Handle its responses:
   - `null` → no session exists yet for that date. Continue to step 5 as a create.
   - a session object → continue to step 5 as an update; note its `updated_at` for the
     conflict check in step 6.
   - `{error: "multiple_sessions_on_date", sessions: [...]}` → more than one session exists that
     day (the site supports multiple 1-on-1s per day via `session_time`). Show the human the
     listed sessions (time/title) and ask which one this file corresponds to — never guess.

5. **Diff.** Compare the file's notes and action items against the fetched session (or note that
   this would be a brand-new session). Build a clear before/after summary: what the session
   title/notes would become, which action items would be created vs. updated (and how), and
   which existing DB action items the file doesn't mention (these are **never** deleted — say so
   explicitly if it's not obvious, so the human isn't surprised items didn't disappear).

6. **Confirm.** Show the diff from step 5 and get explicit yes/no before writing anything. Never
   write silently, even for what looks like an obviously-safe change.

7. **Write**, only after confirmation:
   - No existing session: call `mcp__ax-sessions__upsert_session` to create it (admin PAT only —
     if the caller is a champion PAT and no session exists, tell them this needs an admin and
     stop; don't attempt the call — it returns an error result, not an HTTP 403).
   - Existing session: call `mcp__ax-sessions__upsert_session` with the changed
     title/notes and `expected_updated_at` set to the value fetched in step 4. If it returns
     `{error: "conflict", ...}`, someone else edited the session since you fetched it — re-run
     step 4 to get the fresh state, re-diff, and re-confirm before retrying. Never blindly retry
     with the same `expected_updated_at`.
     **Champion callers cannot change the title** — only `notes` is writable for a
     champion-owned session; a title edit in the file is silently dropped server-side (the call
     still "succeeds"). Check the `title` field in the response: if a champion PAT tried to
     change it and it didn't take, tell the human plainly that the title needs an admin to
     change, rather than reporting a clean success.
   - Call `mcp__ax-sessions__sync_action_items` with the full items array (id-bearing items
     update; id-less items create). Check the per-item results: report any `not_found` or
     `error` entries to the human plainly rather than silently dropping them.
     New items are ordered by their position in the submitted array, not appended after
     existing DB items — if the file only contains a subset of the session's action items
     (some DB-only items weren't in the note), a sync can interleave/reorder items on the
     site. Mention this to the human when the file looks like a partial list.

8. **Write IDs back to the file.** After a successful write, update the Obsidian file's HTML
   comments: add `session_id`/`champion_id` if this was a new session, and add `<!-- id: ... -->`
   for each newly created action item using the ids returned by `sync_action_items`. This is what
   makes the next sync a clean update instead of a duplicate create.

9. **Report.** One line per thing that changed (e.g. "✅ 노트 갱신, 액션아이템 1개 신규 생성·1개
   완료 처리"). If nothing changed, say so plainly instead of a generic "완료".

## Direction B: App → Obsidian (export)

Less common (per design, ~10% of usage) — no dedicated export tool exists; you read via
`get_session` and write the file yourself.

1. Identify champion + date as in Direction A step 1.
2. Call `mcp__ax-sessions__get_session`. If `null`, tell the human no session exists for that
   date yet and stop.
3. If a local note file already exists for this session, diff the fetched content against the
   file and confirm before overwriting — never clobber local edits silently.
4. If no local file exists, propose the target path (following the vault's existing note
   convention) and confirm before creating it, using the same HTML-comment ID format from
   Direction A step 2 so future syncs match correctly.

## Notes

- Never write to the app or to an Obsidian file without an explicit confirmation that showed the
  actual diff first.
- Never delete an action item to reconcile a mismatch — `sync_action_items` itself never deletes;
  don't work around that by calling something else. Deletion is a manual, site-only action.
- Never guess which champion or which session (when multiple exist on one date) — always ask.
- If a tool call returns `forbidden` (from `sync_action_items`), it means either the caller
  doesn't have access to that session (a champion PAT trying to touch another champion's
  session) or `session_id` doesn't exist at all (e.g. a stale/typo'd id left over from an
  earlier sync) — the tool can't tell these apart. Tell the human plainly and stop; if the id
  looks stale, suggest re-running `get_session` to find the real one instead of retrying as-is.
- If a tool call fails outright (network/5xx), say so and stop — don't fall back to guessing what
  the write would have done.
