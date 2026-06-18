-- Allow a champion to have multiple project_charters (one per charter)
ALTER TABLE project_charters DROP CONSTRAINT IF EXISTS project_charters_user_id_key;
