---
name: champion-milestone-sync
description: Use when an AX champion finishes a coding session on their own project and wants to sync progress to the ax-homework-submission milestone tracker. Triggers on "마일스톤 업데이트", "마일스톤 동기화", "오늘 작업 기록해줘", "milestone sync", "sync my milestones".
---

# Champion Milestone Sync

Syncs what happened in the current Claude Code session to the champion's milestones on
ax-homework-submission — progress status and a dated activity note — without the champion
needing to open the website.

This skill has two parts: a small Node script (`scripts/pairing-client.mjs`) that handles
authentication and HTTP calls, and you, the agent, who handles everything that requires
judgment: summarizing the session, matching it to milestones, and confirming with the champion
before writing anything.

**Requires `AX_MILESTONE_SYNC_API_URL`** to be set in the environment to the deployed
ax-homework-submission URL. If it's missing, the script will say so — tell the champion to set
it (e.g. in their shell profile) and stop; do not guess a URL.

## Steps

1. **Ensure paired.** Run:
   ```
   node <skill_dir>/scripts/pairing-client.mjs ensure-paired
   ```
   - If the output has `"alreadyPaired": true`, continue to step 2 immediately.
   - Otherwise the output includes `pairingUrl`, `code`, and `instructions`. Show the champion the
     `instructions` text verbatim, and open `pairingUrl` in their browser if you're able to. The
     script blocks for up to 5 minutes polling for approval — while it's running, tell the
     champion you're waiting for them to click the confirm button. If it exits with a timeout or
     expiry error, relay that plainly and offer to retry from the top.

2. **Fetch milestones.** Run:
   ```
   node <skill_dir>/scripts/pairing-client.mjs list-milestones
   ```
   This returns a JSON array of the champion's published milestones (`id`, `title`,
   `description`, `status`, etc.). If the array is empty, tell the champion they don't have any
   milestones registered yet on the site and stop here — do not proceed to matching.

3. **Match.** Using your own understanding of what happened in this conversation (not the script),
   compare the actual work done against the milestone titles/descriptions. Select zero, one, or
   several milestones that the session's work genuinely relates to. Never force a match. If
   nothing matches, this may be a pivot — go to **"Handling a pivot"** below instead of continuing
   to step 4.

4. **Confirm.** Present all matched candidates together in one message, e.g.:
   > 오늘 세션에서 ModuSign 연동 API 에러 핸들링을 고쳤습니다. 이 작업을 [M4. 전자서명(ModuSign) 연동]에
   > 기록할까요?
   Wait for an explicit yes before writing anything. For any candidate whose work sounds fully
   finished (not just progressed), ask a **separate** explicit question — "이 마일스톤을 완료로
   표시할까요?" — never bundle a completion claim into the general progress confirmation.

5. **Write.** For each confirmed milestone, run:
   ```
   node <skill_dir>/scripts/pairing-client.mjs log-milestone <milestone_id> "<one-line summary of the work>" --in-progress [--complete]
   ```
   Add `--complete` only if the champion explicitly confirmed completion in step 4. Add
   `--date=YYYY-MM-DD` only if the work being logged happened on a date other than today.

6. **Report.** Summarize what was written, one line per milestone updated (e.g. "✅ M4 진행중으로
   갱신, 로그 남김"). If a call fails with `charter_not_approved`, the note was NOT saved — the
   server rejects the whole request before writing anything when the champion doesn't have an
   approved charter yet. Tell the champion clearly that this update didn't go through and their
   charter needs to be approved first; suggest they check the site or contact an admin. Don't
   imply it might have partially succeeded.

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
   - Run `node <skill_dir>/scripts/pairing-client.mjs milestone-log <milestone_id>` and read the
     `count` field from the result. If `milestone-log` fails for any reason (including a 405 if
     the site's log-read endpoint isn't deployed yet), do not delete that milestone — report the
     failure to the champion and move on to the next one.
   - Check the milestone list already fetched in step 2 of the main flow for any entry whose
     `parent_milestone_id` equals this milestone's `id` (its sub-milestones, if any) (this list
     only contains published milestones — if the champion has draft sub-milestones under the one
     being deleted, this check won't see them, so mention that limitation if it seems relevant).
   - Ask, as its own explicit question: "[제목] 마일스톤을 삭제할까요? 활동 로그 N건이 함께
     사라집니다." — append ", 하위 마일스톤 M개는 삭제되지 않고 최상위로 이동합니다." if any
     sub-milestones were found. Deleting is permanent (`ON DELETE CASCADE` on the activity log) —
     the champion must see the count before answering; never guess it or skip the check. A blanket
     approval like '다 지워줘' does not count as confirming any individual deletion — each
     milestone still needs its own question, asked after its own log count has been shown, and its
     own explicit answer.
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
   confirmation is independent of step 2's — a "no" there never skips this. On no, skip to step 6
   and report that nothing new was created.

4. **Create it.** First determine which charter this belongs to: look at `charter_submission_id` on
   the milestones already fetched in step 2 of the main flow (every milestone object includes it —
   you always have at least one existing milestone to read this from, since the pivot flow is only
   reached after step 2 confirmed the list is non-empty). If they all share the same value, use it.
   If they disagree, ask the champion which one this new milestone belongs to before proceeding —
   never guess. On yes:
   ```
   node <skill_dir>/scripts/pairing-client.mjs create-milestone "<title>" --description="<description>" --charter-submission-id="<id>"
   ```
   Read the new milestone's id from the result's `milestone.id` field — you need it for step 5.

5. **Offer to log today's work on it immediately.** Ask: "오늘 작업도 여기에 기록할까요?" On yes,
   run step 5 ("Write") of the main flow above against the newly created milestone's id, exactly
   as you would for a matched milestone — including the separate completion question if
   applicable, and the same `charter_not_approved` handling from step 6 of the main flow if marking
   progress fails (report that the milestone itself was created successfully even if marking it
   in-progress wasn't — don't let one failure make the whole pivot sound like it failed). On no,
   skip to step 6 without logging.

6. **Report.** One line per action actually taken — each deletion, the new milestone (or that it
   was declined), and whether today's work got logged to it. If the champion declined everything,
   say that plainly rather than a generic "완료". Only ever use milestone ids exactly as they
   appeared in the fetched list — report deletions based on what the champion confirmed, not
   merely on the command exiting without error (a delete call against an id that doesn't match
   anything also exits without error).

## Notes

- Never write anything without the explicit confirmation from step 4 of the main flow (in a pivot,
  the corresponding confirmation in that section).
- Never un-complete a milestone or edit `milestones.note` (the website's own manual note field) —
  this skill only ever adds activity-log entries and optionally moves a milestone from
  not-started/delayed to in-progress or completed.
- If any call fails with "token no longer valid", the script has already cleared the local config;
  just re-run step 1 to re-pair.
- Pivot handling (above) never touches a charter (`charter_submissions`) — only milestones. If the
  champion's actual charter direction changed, tell them that's still a site edit, not something
  this skill does.
- Deleting a milestone is irreversible and takes its entire activity log with it — always show the
  log count and get an explicit yes before calling `delete-milestone`, with no exceptions.
