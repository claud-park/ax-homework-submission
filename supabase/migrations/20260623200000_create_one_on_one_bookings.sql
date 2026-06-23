CREATE TABLE one_on_one_bookings (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  champion_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  champion_name     text        NOT NULL,
  champion_email    text        NOT NULL,
  duration_minutes  int         NOT NULL CHECK (duration_minutes IN (30, 60)),
  slot_start        timestamptz NOT NULL,
  slot_end          timestamptz NOT NULL,
  available_admins  text[]      NOT NULL,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  confirmed_by      text        CHECK (confirmed_by IN ('claud', 'alex', 'jennifer')),
  slack_ts          text,
  slack_channel     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE one_on_one_bookings ENABLE ROW LEVEL SECURITY;

-- Champion은 자신의 행만 조회/삽입 가능
CREATE POLICY "own_bookings_select" ON one_on_one_bookings
  FOR SELECT USING (auth.uid() = champion_user_id);

CREATE POLICY "own_bookings_insert" ON one_on_one_bookings
  FOR INSERT WITH CHECK (auth.uid() = champion_user_id);
