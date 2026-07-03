-- 멀티청크 녹음의 모든 청크 경로를 보존한다.
--
-- 기존엔 process 라우트가 audio_file_path 에 첫 청크(rawPaths[0])만 저장해,
-- 여러 청크로 나뉜 긴 녹음의 나머지 오디오를 다운로드할 수 없었다.
-- audio_chunk_paths 에 전체 청크 경로를 순서대로 저장한다.
-- audio_file_path 는 하위호환(첫 청크)으로 계속 유지한다.

ALTER TABLE check_up_sessions ADD COLUMN IF NOT EXISTS audio_chunk_paths TEXT[];
