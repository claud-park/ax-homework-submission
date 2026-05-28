-- week_number is no longer required in the milestone form
ALTER TABLE milestones ALTER COLUMN week_number DROP NOT NULL;
ALTER TABLE milestones ALTER COLUMN week_number SET DEFAULT NULL;
