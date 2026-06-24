-- Prevent concurrent duplicate pending bookings at DB level
CREATE UNIQUE INDEX one_on_one_bookings_pending_per_champion
  ON one_on_one_bookings (champion_user_id)
  WHERE status = 'pending';
