# 1-on-1 녹음 STT 견고화 (gpt-4o-transcribe + 클라이언트 청크/정규화)

- 작성일: 2026-06-30
- 브랜치: `bugfix/stt-gpt4o-chunked`
- 상태: 설계 승인됨, 구현 대기

## 1. 배경 / 문제

admin 챔피언 상세의 1-on-1 녹음 "녹음 종료 & AI 요약" 후, AI 요약이 **전혀 다른 미팅 내용**처럼 나오는 버그가 보고됨.

### 근본 원인 (프로덕션 데이터로 확정)

녹음·업로드·저장·세션 매칭 파이프라인은 전부 `sessionId`로 잠겨 있어 정상이었다. 실패 지점은 **STT(전사) 단계**:

- 저장된 오디오는 본인 미팅이 맞고(길이·경로·업로드 시각 일치, 다른 세션과 교차오염 없음), 25분 분량이 온전히 들어있음.
- 그러나 오디오 음량이 낮음(세션 A 평균 **-30 dBFS**). `whisper-1`이 저음량/무음 구간에서 **환각 반복 루프**를 생성:
  - 세션 A(`6e6156ec`): "현금으로 따시면 됩니다" / "1 1 1 …" 반복 — 25분인데 ~1,300자.
  - 세션 B(`f321502a`): "라면을 끓여줘야 라면이 맛있어 보인다" 반복, 그리고 Whisper의 대표적 무음 환각 토큰 **"시청해주셔서 감사합니다"** 출현.
- 이 쓰레기 transcript를 Claude가 요약 → "다른 미팅"처럼 보임.

### 검증으로 확인된 사실 (재전사 실험)

| 조합 | 세션 A | 세션 B |
|---|---|---|
| `whisper-1` (현재) | ❌ 환각 루프 | ❌ 환각 루프 |
| `gpt-4o-transcribe` (원본 저음량) | ⚠️ 거의 안 잡힘(16자) | ✅ 실제 내용(415자+) |
| `gpt-4o-transcribe` (음량 정규화) | ✅ 실제 내용(5,736자) | ⚠️ loudnorm이 악화 |

핵심 결론:
1. **`gpt-4o-transcribe`는 환각 루프를 만들지 않는다** — 못 알아들으면 짧게 반환할지언정 쓰레기를 양산하지 않음. (현재 버그의 직접 해소)
2. **`gpt-4o-transcribe`는 오디오 1400초(~23분) 상한**이 있어, 보통 길이의 1-on-1(20~40분)은 **청크 분할이 필수**.
3. **게인 정규화가 저음량 복구에 결정적**이나, `loudnorm` 2-pass는 불안정(B 악화). → **RMS 타깃 게인 + 리미터**로 안정화 필요.

## 2. 목표 / 비목표

### 목표
- 저음량 녹음에서도 환각 없이 실제 내용을 전사한다.
- 모델 길이 상한(1400s)을 청크 분할로 우회한다.
- 전사 품질이 낮으면 잘못된 요약을 그대로 노출하지 않고 사용자에게 알린다.
- 잘못 요약된 기존 두 세션(`6e6156ec`, `f321502a`)을 복구한다.

### 비목표
- 녹음 캡처 방식 변경(시스템/탭 오디오 캡처 등)은 이번 범위 밖. (저음량의 더 근본 원인일 수 있으나 별도 과제)
- 세션 목록 정렬 비결정성(`GET /api/sessions`의 `session_date`-only 정렬) 수정은 별도 이슈로 분리.
- 요약(Claude) 프롬프트/모델 변경 없음.

## 3. 아키텍처

```
[브라우저]                                   [서버]                         [외부]
녹음/업로드 blob
  └ prepareAudioForUpload()
      ├ OfflineAudioContext 디코드 → 16kHz mono PCM
      ├ normalizePcm()  (RMS 타깃 + 리미터)
      └ planChunks() + encodeWav() → WAV 청크[]
            │ (각 청크 signed URL 직접 업로드)
            ▼
   sessions/{id}/chunk_000.wav …
            │  POST /process { audioPaths:[...] }
            ▼
                                   각 청크 download
                                     └ transcribeChunk() ─────────► gpt-4o-transcribe
                                   transcript 합침
                                     └ assessTranscript()  (품질 가드)
                                     └ summarizeTranscript() ─────► Claude (변경 없음)
                                     └ persist (notes/raw_transcript/status)
```

## 4. 컴포넌트 / 인터페이스

### 4.1 순수 함수 (Node 단위테스트 대상)

- `lib/audio/normalize.ts`
  - `normalizePcm(samples: Float32Array, opts?: { targetRmsDb?: number; maxGainDb?: number; limitDb?: number }): Float32Array`
  - 기본값: `targetRmsDb=-20`, `maxGainDb=30`, `limitDb=-1`. RMS 측정 → `gain = min(target/rms, maxGain)` 적용 → `limitDb` 하드 리미터로 클리핑. 무음(rms≈0)이면 게인 1로 패스(노이즈 폭증 방지).
- `lib/audio/chunk.ts`
  - `planChunks(totalSamples: number, sampleRate: number, opts?: { maxSec?: number; maxBytes?: number }): { start: number; end: number }[]` — `maxSec=720`, `maxBytes=24*1024*1024` 중 더 작은 경계로 균등 분할.
  - `encodeWav(samples: Float32Array, sampleRate: number): Uint8Array` — 16-bit PCM mono WAV 헤더 + 샘플.
- `lib/audio/quality.ts`
  - `assessTranscript(text: string, durationSec: number): { ok: boolean; charsPerSec: number; repetitionRatio: number; reason?: string }`
  - 규칙(초기값, fixture로 튜닝): `repetitionRatio < 0.4` 또는 `charsPerSec < 1.2` → `ok=false`. 세그먼트는 공백/문장부호 분리, 길이>2만 집계.

### 4.2 브라우저 글루

- `lib/audio/prepareUpload.ts` (browser-only)
  - `prepareAudioForUpload(blob: Blob): Promise<{ wav: Uint8Array; index: number }[]>`
  - `OfflineAudioContext`(16kHz)로 `decodeAudioData` → 모노 다운믹스 → `normalizePcm` → `planChunks` → 각 구간 `encodeWav`.
  - 디코드 실패 시 throw → 호출부에서 에러 표시.

### 4.3 `RecordingPanel` 변경

- `uploadAndProcess`가 단일 파일 대신 청크 배열을 처리:
  1. `prepareAudioForUpload(blob)` → 청크 배열
  2. 각 청크에 대해 `/api/sessions/{id}/upload-url` (ext=`wav`, index 전달) → `sessions/{id}/chunk_{NNN}.wav` 업로드
  3. `/api/sessions/{id}/process` 에 `{ audioPaths: string[], recordingDurationSec }` 전달
- 진행률 표시는 청크 수 기준으로 갱신.

### 4.4 `upload-url` 라우트 변경

- body에 `index?: number` 수용. 경로 = `sessions/{id}/chunk_{NNN}.wav` (index 없으면 레거시 단일 `audio.{ext}` 유지 — 파일 업로드 호환은 prepare를 거치므로 항상 wav 청크).
- `wav`는 이미 `AUDIO_CONTENT_TYPES`에 존재.

### 4.5 `process` 라우트 변경

- body: `audioPaths: string[]`(신규) 또는 `audioPath: string`(레거시 호환) 수용.
- 각 경로가 `sessions/{id}/`로 시작하는지 검증.
- `processSessionAudio(supabase, sessionId, audioPaths, durationSec)`:
  - 각 청크 download → `transcribeChunk(buffer, 'audio.wav')` (gpt-4o-transcribe) → 인덱스 순 join.
  - `assessTranscript()` 호출.
  - `audio_file_path`에 **첫 청크 경로** 저장(“오디오 있음” 게이트 + 표시용). reprocess는 `storage.list('sessions/{id}')`로 청크 수집·정렬.

### 4.6 `transcribe.ts` 변경

- 모델 상수 `whisper-1` → `gpt-4o-transcribe`. 함수는 단일 청크(≤1400s, ≤25MB) 가정. 길이/용량 검증 메시지 유지.

### 4.7 품질 가드 → 상태/UI

- `assessTranscript().ok === false`면 `processing_status = 'low_quality'`로 저장(요약·transcript는 그대로 저장하되), 요약 노트 상단에 `⚠️ 전사 품질이 낮을 수 있습니다 (재녹음/재처리 권장)` 안내.
- UI(`AdminSessionDetail`/리스트)에서 `low_quality` 배지 표시 + 기존 재처리(reprocess) 버튼 노출.

## 5. 데이터 / 스키마

- migration: `check_up_sessions.processing_status` 제약(있다면)에 `'low_quality'` 추가. CHECK 제약이 없으면 코드 상수만 추가.
- `lib/types.ts`의 `CheckUpSession.processing_status` 유니온에 `'low_quality'` 추가.
- 스토리지 레이아웃: `sessions/{id}/chunk_NNN.wav` (레거시 `audio.webm` 단일 파일도 reprocess에서 호환 처리).

## 6. 에러 처리

- 청크 업로드 실패: 해당 청크 재시도 1회 후 실패 시 전체 중단 + 에러 표시(부분 전사 방지).
- 한 청크 전사 실패: 전체 실패 처리(`processing_status='error'`), 메시지 노출.
- 디코드 실패(손상 blob): 사용자에게 재녹음 안내.
- 1400s 초과 청크가 생기지 않도록 `planChunks` 상한을 보장(방어적 assert + 테스트).

## 7. 테스트 전략 (TDD)

- `normalize.test.ts`: 저음량 입력 게인 상승, 무음 패스, 리미터 클리핑 경계.
- `chunk.test.ts`: 경계 분할 개수/길이, `maxBytes`·`maxSec` 중 작은 값 적용, WAV 헤더 유효성.
- `quality.test.ts`: **실제 두 녹음의 나쁜 transcript fixture**가 `ok=false`, 정상 transcript fixture가 `ok=true`. charsPerSec/repetitionRatio 경계.
- `process` 라우트: OpenAI/Storage 목으로 멀티청크 join·순서·품질가드 분기.
- 기존 `audio-pipeline.test.ts`/`audio.test.ts` 회귀 유지.

## 8. 별도 작업: 기존 두 세션 복구

구현과 독립적으로(브라우저 코드 배포 불필요), 로컬 스크립트로 복구:
1. 로컬 `ffmpeg`로 각 세션 오디오 디코드 → 16kHz mono → 정규화 → ≤720s 청크.
2. 각 청크 `gpt-4o-transcribe` → transcript 합침 → `assessTranscript`로 확인.
3. 기존 `summarizeTranscript`(Claude) 로직으로 요약 → `combineSessionNotes`로 핸드라이팅 노트 보존하며 `notes`/`raw_transcript`/`processing_status` 갱신.
4. 결과를 사용자에게 보고 후 DB 반영.

## 9. 롤아웃 / 리스크

- 클라이언트 디코드는 데스크톱 Chrome(admin 사용 환경) 기준 OK. 25분 16kHz mono float32 PCM ≈ 96MB(=1500s×16000×4B) — OfflineAudioContext에서 처리 가능. WAV(16-bit) 인코딩 후 청크는 청크당 ≤24MB.
- 정규화 파라미터는 두 실제 녹음으로 검증 후 확정(과증폭 방지가 핵심).
- 배포는 사용자 승인 후. 이 작업은 sticky-header 브랜치와 분리된 `bugfix/stt-gpt4o-chunked`.
