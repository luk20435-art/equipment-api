ALTER TABLE user_requests
  ADD COLUMN IF NOT EXISTS return_notes JSONB;
