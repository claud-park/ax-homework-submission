ALTER TABLE milestone_deliverables ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE milestone_deliverables ALTER COLUMN file_name DROP NOT NULL;
ALTER TABLE milestone_deliverables ADD COLUMN IF NOT EXISTS link_url TEXT;
