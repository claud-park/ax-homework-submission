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

**If the native tools still don't show up** (confirmed in practice: `ToolSearch` can come back
empty even in a session started fresh after `claude mcp add`/`/reload-skills`, with `claude mcp
list` showing `ax-sessions` as Connected) — fall back to calling the MCP HTTP endpoint directly
instead of blocking on tool availability:
1. Read the bearer token straight out of the local Claude Code config:
   `python3 -c "import json; print(json.load(open('/Users/<user>/.claude.json'))['mcpServers']['ax-sessions']['headers']['Authorization'])"`
   (adjust the home path). This requires no re-pairing.
2. Call tools with a plain JSON-RPC POST, e.g.:
   `curl -sS -X POST "$AX_MILESTONE_SYNC_API_URL/api/mcp" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Authorization: <token from step 1>" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}'`
   The response is an SSE line (`data: {...}`); the tool's actual JSON result is at
   `result.content[0].text` inside that payload.
3. This call needs the sandbox's network restriction lifted for the `curl` — otherwise it silently
   returns a fake typed stub (`{code: string, expires_at: string, ...}`) instead of hitting the
   real server. Use the harness's mechanism for that (e.g. Claude Code's
   `dangerouslyDisableSandbox` on the Bash tool) rather than treating the stub as a real response.
4. For calls beyond a couple, write a small throwaway Python/Node script that wraps this curl call
   once and loop over it, instead of hand-typing one `curl` per tool call — see "Bulk syncs" below.
   Never leave the token sitting in a script or temp file after you're done; delete it once the
   sync completes.

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

   **In practice, real vault notes rarely look this simple.** A note produced by an AI
   meeting-recorder tool typically has YAML frontmatter (`date:`, `time:`, `participants:`,
   `projects:`) followed by rich structured sections: 화자 매핑(추정), 🎯 요약, 🗣️ 논의 주제,
   💬 피드백, 🤨 고민·요청 사항, 🤝 합의 사항, ✅ 액션 아이템 (checkboxes usually written as
   `- [ ] **Name**: body`), and a full 전체 전사록 (raw transcript, often hundreds of lines).
   There is no `session_id`/`champion_id` comment on a first-time sync — that's expected, not
   an error. When you meet this shape:
   - `session_date` comes from the frontmatter `date:` field, not from parsing the filename/title.
   - Build `notes` as a condensed synthesis of **요약 + 논의 주제 (condensed to 1–2 lines per
     subsection) + 결정/합의 사항** only. Do not port 화자 매핑, 피드백, 고민·요청 사항, or the
     raw 전사록 into `notes` — they're real content but not what belongs in a tracker's notes
     field; they stay in Obsidian. Skipping the transcript specifically also keeps `notes` from
     ballooning to thousands of characters.
   - Build the action items list strictly from the ✅ 액션 아이템 section's checkboxes, one item
     per bullet, keeping the `**Name**:` prefix in the body text — do not also pull items from
     🪏 팔로업 ("follow-up") sections some notes have; treat those as out of scope unless the
     human asks to include them.

3. **Resolve the champion.** If `champion_id` isn't cached in the file yet, call
   `mcp__ax-sessions__list_champions` (admin-only — returns `admin_required` for a champion PAT,
   which is fine, skip this step for champion callers who always act as themselves) to map the
   champion's name to a `user_id`. `list_champions` returns names formatted as
   `한글이름(EnglishNickname)/부서/Dreamus` (e.g. `강진영(Carol)/DSP사업팀/Dreamus`) — match against
   whichever identifier the note actually uses (the meeting title, the frontmatter
   `participants:` list, or a name mentioned in 화자 매핑 often only gives the English nickname
   like "Carol" or "Luffy"). If a note's filename/title doesn't clearly name a single champion
   (e.g. a generic "AX 1:1" title), use the frontmatter `participants:` list — the champion is
   whichever participant isn't one of the recurring AX team members, and if it's still ambiguous,
   ask. Suggest writing the resolved id into the file's HTML comment so future runs skip this
   lookup. Building the full name→id map once per sync batch (not once per file) is worth it when
   syncing more than a couple of notes — see "Bulk syncs" below.

4. **Fetch current app state.** Call `mcp__ax-sessions__get_session` with the date (and
   `champion_user_id` for admin callers). Handle its responses:
   - `null` → no session exists yet for that date. Continue to step 5 as a create.
   - a session object → continue to step 5 as an update; note its `updated_at` for the
     conflict check in step 6.
   - `{error: "multiple_sessions_on_date", sessions: [...]}` → more than one session exists that
     day (the site supports multiple 1-on-1s per day via `session_time`). Show the human the
     listed sessions (time/title) and ask which one this file corresponds to — never guess.

   **A session that already exists may not have come from a prior Obsidian sync at all.** The
   site has its own audio-upload→STT→Claude-summary pipeline (`check_up_sessions.audio_file_path`
   / `recording_duration_sec` / `processing_status` populated means this). It's common for the
   same real-life meeting to be captured independently by both the site's recorder and a separate
   Obsidian meeting-recorder tool, producing two differently-worded but overlapping summaries of
   the same conversation — neither is "the sync source" for the other. Before proposing to
   overwrite an existing session's `notes` or add to its `action_items`, check whether it already
   looks substantively populated (real `notes`, a non-empty `action_items` array covering similar
   ground to what the Obsidian file would produce). If so, don't treat this as a normal
   Obsidian-wins-on-conflict update — surface it to the human as a distinct decision instead of
   folding it into the general diff-and-confirm: e.g. "this session already has 7 site-generated
   action items covering the same meeting, worth touching or fine as-is?" Only propose a plain
   fill when the gap is unambiguous and additive with no risk of duplication — e.g. `notes` exists
   but `action_items` is empty (a failed/partial site-side extraction) — in which case adding the
   Obsidian-derived action items is safe and worth doing without extra deliberation.

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

## Bulk syncs (many notes / "sync everything")

When asked to sync a whole folder or "모든 챔피언의 노트" rather than one file, don't run steps
1–9 file-by-file with a confirmation prompt after each one — gather everything read-only first,
then confirm once against a single consolidated plan:

1. List candidate files (a vault's meeting-notes folder usually mixes real 1-on-1s with unrelated
   meetings — weeklies, lunches, cross-team syncs; filter by filename/title pattern like
   `1-on-1`/`1_1` before doing anything else, and confirm the filtered set with the human if it's
   not obvious).
2. Call `list_champions` once, resolve every file to a champion up front.
3. Call `get_session` for every (champion, date) pair before writing anything, so you know the
   full shape of the work: how many are genuinely new, how many already exist with a real gap to
   fill, and how many already exist and are already well-populated (see the gotcha under step 4
   above — this is where it matters most, since a bulk sync is exactly when it's tempting to
   treat "session exists" as a uniform "update" case).
4. Present one plan grouped by category — net-new creates, gap-fills, and "already covered,
   proposing to skip" — and get a single explicit go-ahead, rather than N separate confirmations.
   For the ambiguous "already has content" cases, state your proposed handling (usually: leave
   alone) and let the human override per-item if they disagree.
5. Execute writes, then batch the ID-backfill (step 8) across every touched file before reporting.
   If most of the calls go through the raw-HTTP fallback (see above) because native tools aren't
   loaded, write one throwaway script that loops through all the session payloads rather than
   invoking `curl` once per call — check every result for a non-`created`/`updated` status before
   reporting success, since a partial failure in the middle of a large batch is easy to miss
   otherwise.

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
