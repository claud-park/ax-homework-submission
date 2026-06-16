-- 023_milestone_source.sql
-- 마일스톤 생성 출처 추적 (수동 / AI 생성 / 템플릿)
-- "smart" 마일스톤 입력 기능의 채택률 분석용. 기본값 'manual'로 기존 행 안전.

ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'ai', 'template'));

COMMENT ON COLUMN milestones.source IS '마일스톤 생성 출처: manual(직접 입력) | ai(Charter 기반 AI 생성) | template(프리셋)';
