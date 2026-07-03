# 1:1 세션 처리 개선: 백그라운드 처리 + 멀티청크 다운로드 Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. 이 플랜은 **동작을 바꾸는** 변경이라 배포 전 사용자 리뷰가 필요하다.

**Goal:** (A) 세션 녹음 STT/AI 처리를 동기 5분 대기에서 백그라운드+폴링으로 전환하고, (B) 멀티청크 녹음의 전체 오디오를 다운로드 가능하게 만든다.

**왜 별도 플랜인가:** 두 변경 모두 (1) 실제 STT 파이프라인/OpenAI/스토리지가 있어야 검증 가능하고, (2) 동작(동기→비동기, 단일→다중 다운로드)을 바꾸므로 "기능 동일성 유지" 제약상 blind 배포 불가. 안전한 정렬 수정만 별도 PR로 선반영함.

---

## Part A — 백그라운드 처리 전환

**현 상태:** `app/api/sessions/[sessionId]/process/route.ts`가 업로드→STT→요약을 단일 요청에서 실행(`maxDuration=300`). 어드민이 탭을 닫으면 처리 유실, 60분+ 녹음은 300초 근접.

**설계 (폴링 방식 — Vercel Queues보다 리스크 낮음):**
- `check_up_sessions.processing_status`(이미 존재: pending/processing/done/error 계열)를 상태 머신으로 사용.
- `POST /process`: `claimSessionForProcessing`로 락 → **202 즉시 응답** 후 `processSessionAudio`를 `waitUntil()`(Vercel `after`/`waitUntil`)로 백그라운드 실행. 요청-응답 수명과 분리.
- 신규 `GET /api/sessions/[sessionId]/status`: `processing_status` + 결과 요약/에러 반환.
- 클라이언트 `RecordingPanel.tsx`: fetch 완료 대기 대신 상태 폴링(2~3s 간격)으로 진행률 표시. 탭 유지 불필요 문구로 변경.
- 실패 시 상태=error + 기존 [다시 시도] 유지.

**검증(필수, 실제 환경):**
- [ ] 단기(1청크)/장기(다청크) 녹음 각각 처리 완료·상태 전이 확인
- [ ] 처리 중 탭 닫았다 재진입 → 폴링이 완료 상태 픽업
- [ ] 동시 요청 시 락(409) 유지 확인
- [ ] `processSessionAudio` 오케스트레이션 통합 테스트 추가(현재 순수 유틸만 커버)

**주의:** Vercel `waitUntil`/`after`의 함수 실행 시간 상한 확인 필요(장기 작업이면 청크 단위 진행 저장 or Queues 승격 검토). Fluid Compute 기준 실측 후 결정.

---

## Part B — 멀티청크 다운로드

**현 버그:** `process/route.ts:57` `audio_file_path: rawPaths[0]` — 첫 청크만 기록. 나머지 청크는 스토리지(`sessions/{id}/...`)에 존재하나 다운로드 불가.

**설계:**
- [ ] 마이그레이션: `check_up_sessions.audio_chunk_paths TEXT[]` 추가(기존 `audio_file_path`는 하위호환 유지 — 첫 청크).
- [ ] `process/route.ts`: `audio_chunk_paths: rawPaths` 저장.
- [ ] `GET /api/sessions/[sessionId]/audio-url`: `audio_chunk_paths`가 있으면 각 청크의 signed URL 배열 반환, 없으면 기존 단일 URL(하위호환).
- [ ] `RecordingPanel.tsx` 다운로드 버튼: 단일이면 기존대로, 다중이면 순차 다운로드(또는 서버측 zip 스트리밍 — 함수 메모리 고려).

**검증:**
- [ ] 단일 청크 세션: 기존과 동일하게 1파일 다운로드
- [ ] 다청크 세션: 모든 청크 다운로드 가능
- [ ] 과거 데이터(마이그레이션 전 세션): `audio_file_path` fallback로 최소 첫 청크 다운로드

---

## 선반영 (이 플랜과 별개, 이미 PR)

- `GET /api/sessions` 결정적 정렬(session_date → session_time → created_at) — 순수 수정, 동작 안전.
