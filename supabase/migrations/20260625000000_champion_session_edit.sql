-- champion이 본인 1-on-1 세션의 노트/액션 아이템을 편집할 수 있도록 RLS 정책 추가.
-- (mutation은 service client로 RLS를 우회하므로 보조 방어선 — 필드 단위 제한은 API가 담당)

-- check_up_sessions: champion이 본인 세션 UPDATE 허용
CREATE POLICY "checkup_champion_update" ON check_up_sessions
  FOR UPDATE USING (auth.uid() = champion_user_id)
  WITH CHECK (auth.uid() = champion_user_id);

-- session_action_items: champion이 본인 세션의 아이템 INSERT/DELETE 허용
-- (UPDATE는 기존 action_items_champion_toggle 정책이 소유 행을 이미 허용)
CREATE POLICY "action_items_champion_insert" ON session_action_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM check_up_sessions WHERE id = session_id AND champion_user_id = auth.uid())
  );

CREATE POLICY "action_items_champion_delete" ON session_action_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM check_up_sessions WHERE id = session_id AND champion_user_id = auth.uid())
  );
