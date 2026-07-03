# 알림 신뢰성 강화: 다채널 + Nudge 쿨다운 Implementation Plan

> **For agentic workers:** 이 플랜은 스키마 변경 + 실환경(Slack/SMTP) 검증이 필요해 배포 전 리뷰 대상. 안전한 이메일 재시도만 별도 PR로 선반영함.

**Goal:** 이메일 단일 실패점을 완화하고(관리자 대상 Slack 이중화), Nudge 중복 발송을 막는다.

**현 상태 / 제약:**
- 모든 알림(9 트리거)이 Gmail SMTP 단일 채널(`lib/email.ts`). env 미설정 시 조용히 스킵.
- Slack 인프라(`lib/one-on-one/slack.ts`)는 **어드민(claud/alex/jennifer)만** Slack ID 매핑. 챔피언→Slack 매핑 없음.
- Nudge 발송 이력 테이블 없음 → 쿨다운 불가.

---

## Part A — 관리자 대상 알림 Slack 이중화 (챔피언 대상은 범위 밖)

Slack 매핑이 있는 **어드민 수신 알림**만 이중화 가능:
- `notifyNewSubmission`, `notifyDeadlineChangeRequest`, `notifyBottleneck`, `notifyHotlineMessage`(→admin)

**설계:**
- [ ] `lib/notifications/slack-notify.ts`: 어드민 채널(`ADMIN_SLACK_CHANNEL` env) 또는 어드민 DM으로 best-effort 포스팅. **try/catch로 감싸 실패해도 이메일 흐름에 영향 없게.**
- [ ] 각 어드민 알림 함수에 이메일 발송 후 Slack 포스팅 추가(await하되 실패 무시).
- [ ] 챔피언 대상(nudge, 일부 comment)은 Slack 매핑 부재로 이메일 유지. (향후 챔피언 Slack ID 수집 시 확장)

**검증(SLACK_BOT_TOKEN 필요, 실환경):**
- [ ] Slack 포스팅 성공 케이스
- [ ] Slack 실패 시에도 이메일은 정상 발송(이중화 목적)
- [ ] env 미설정 시 Slack 스킵, 이메일만

## Part B — Nudge 쿨다운

**설계:**
- [ ] 마이그레이션: `nudge_log(user_id, nudge_type, sent_at)` 또는 `users.last_nudged_at`.
- [ ] `POST /api/admin/nudge`: 직전 발송이 쿨다운(예: 24h) 내면 429 반환 + 남은 시간 안내.
- [ ] 프론트(`AdminSidebar`/nudge 버튼): 쿨다운 중 버튼 비활성 + 툴팁.

**검증:**
- [ ] 쿨다운 내 재발송 차단(429)
- [ ] 쿨다운 경과 후 재발송 허용
- [ ] 서로 다른 nudge_type은 독립 쿨다운

---

## 선반영 (이 플랜과 별개, 이미 PR)

- `lib/email.ts` 지수 백오프 재시도(`lib/retry.ts`) — 일시적 SMTP 오류 완화. 계약(반환 void/최종 실패 throw) 보존, 단위 테스트 포함.
