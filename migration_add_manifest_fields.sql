ALTER TABLE user_requests
  ADD COLUMN IF NOT EXISTS manifest_doc_no      TEXT,
  ADD COLUMN IF NOT EXISTS manifest_date        DATE,
  ADD COLUMN IF NOT EXISTS manifest_attn        TEXT,
  ADD COLUMN IF NOT EXISTS manifest_cc          TEXT,
  ADD COLUMN IF NOT EXISTS manifest_carrier     TEXT,
  ADD COLUMN IF NOT EXISTS manifest_truck       TEXT,
  ADD COLUMN IF NOT EXISTS manifest_on          TEXT,
  ADD COLUMN IF NOT EXISTS manifest_ref         TEXT,
  ADD COLUMN IF NOT EXISTS manifest_responsible TEXT;
