# Champion 상세 페이지 개선: 과제정의서 기본 탭 + 녹음 파일 업로드

날짜: 2026-06-24
대상 페이지: `/admin/champions/[userId]`

## 목표

1. Champion 상세 페이지 진입 시 **[과제정의서]** 탭이 기본으로 보이도록 변경.
2. 체크업 세션에서 실시간 녹음뿐 아니라 **녹음 파일(wav, mp3, m4a)** 을 업로드해
   동일한 STT→요약 파이프라인으로 내용을 추출/추론할 수 있도록 기능 추가.

## Task 1 — 과제정의서 기본 탭

`app/admin/champions/[userId]/page.tsx`의 `activeMainTab` 초기 상태를
`'submissions'` → `'charter'`로 변경 (단일 라인).
charter 섹션은 이미 빈 상태(과제정의서 없음)를 처리하므로 안전.

## Task 2 — 녹음 파일 업로드 + 장시간 녹음(30분+) 지원

### 핵심 제약 (두 개의 상한)

1. **Vercel 함수 본문 4.5MB** — 함수로 보내는 요청 본문이 4.5MB를 넘으면
   `413 FUNCTION_PAYLOAD_TOO_LARGE`. 4분 녹음이 이 한도를 넘어 실패했던 원인.
2. **Whisper API 25MB** — STT 입력 파일 하드 리밋.

장시간 녹음(30분+)을 지원하려면 두 상한을 모두 넘어야 한다.

### 해결책

**A. Storage 직접 업로드 (Vercel 4.5MB 우회)**

오디오 바이트를 Vercel 함수로 보내지 않는다:

1. 클라이언트가 `POST /api/sessions/{id}/upload-url`로 **서명된 업로드 URL** 요청
   (서버가 service-role로 `createSignedUploadUrl` 생성, RLS 무관).
2. 클라이언트가 `uploadToSignedUrl`로 **Supabase Storage에 직접 업로드**
   (Vercel을 거치지 않음 → 4.5MB 제한 없음).
3. 클라이언트가 `POST /api/sessions/{id}/process`에 **경로 + 길이(JSON, 소형)** 만 전송.
4. 서버가 Storage에서 다운로드해 Whisper→Claude 처리.

**B. 녹음 비트레이트 하향 (Whisper 25MB 대응)**

`MediaRecorder`를 **32kbps mono Opus**로 설정 → 30분 ≈ 7MB, 60분 ≈ 14MB로
25MB 한도 안에 여유 있게 들어감 (음성 전사 품질 영향 없음). `getUserMedia`는
`channelCount: 1` + echoCancellation/noiseSuppression.

### 진입점

`components/sessions/RecordingPanel.tsx`의 `idle` 단계에 **"녹음하기 / 파일 올리기"**
모드 토글. 두 경로 모두 동일한 `uploadAndProcess`(서명 URL → 직접 업로드 → process JSON)
흐름과 진행 단계(uploading → transcribing → summarizing → done)를 사용.

### 클라이언트 (`RecordingPanel.tsx`)

- 녹음: 32kbps mono Opus. 정지 후 blob 크기 > 25MB면 차단 + 안내.
- 업로드: `accept=".wav,.mp3,.m4a,.webm"`, 형식·25MB 검증.
- `uploadAndProcess`: 서명 URL 발급 → `uploadToSignedUrl` 직접 업로드 →
  `/process`에 `{ audioPath, recordingDurationSec }` JSON 전송. 진행률은
  업로드(파일 크기 기반)·STT(길이 기반)·요약 추정치로 시뮬레이션.

### 신규 엔드포인트 (`app/api/sessions/[sessionId]/upload-url/route.ts`)

- 관리자 검증, `{ ext }` 검증 후 `sessions/{id}/audio.{ext}` 경로의 서명 업로드 URL 반환.

### 공유 파이프라인 (`lib/sessions/processAudio.ts`)

- `process`/`reprocess`가 공유: Storage 다운로드 → 25MB 확인 → Whisper(확장자에서
  형식 도출) → Claude 요약 → notes·action item 저장 → usage 반환.
- 파싱 실패는 `SummaryParseError`로 던져 라우트가 422로 변환.

### 라우트 (`process` / `reprocess`)

- `process`: multipart 제거, JSON `{ audioPath, recordingDurationSec }` 수신.
  경로를 `sessions/{id}/` 하위로 제한, 형식 검증 후 공유 파이프라인 호출.
- `reprocess`: 저장된 `audio_file_path`/`recording_duration_sec`로 공유 파이프라인 호출.
- 둘 다 `export const maxDuration = 300` (장시간 오디오 처리 여유).

### 공유 상수 (`lib/audio.ts`)

허용 MIME/확장자, 25MB 제한, 확장자/content-type 도출 헬퍼. 클라이언트·서버 공용.

## 변경하지 않는 것

- Claude 요약 프롬프트, 액션 아이템 처리 로직.
- 타입 정의(`lib/types.ts`), DB 스키마, Storage 버킷/RLS.

## 비고

- 업로드 파일은 길이를 알 수 없어 `recording_duration_sec=0` → Whisper 비용 $0 표시.
- 매우 긴 녹음(대략 100분+, 32kbps 기준 25MB 초과)은 여전히 청킹이 필요.
  현재 범위(30분+)는 충분히 커버. Whisper+Claude 처리 시간이 300s에 근접할 만큼
  긴 경우(대략 45분+)는 추후 백그라운드 처리로 확장 가능.
