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
   several milestones that the session's work genuinely relates to. If nothing matches, say so and
   stop — never force a match.

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

## Notes

- Never write anything without the explicit confirmation from step 4.
- Never un-complete a milestone or edit `milestones.note` (the website's own manual note field) —
  this skill only ever adds activity-log entries and optionally moves a milestone from
  not-started/delayed to in-progress or completed.
- If any call fails with "token no longer valid", the script has already cleared the local config;
  just re-run step 1 to re-pair.
