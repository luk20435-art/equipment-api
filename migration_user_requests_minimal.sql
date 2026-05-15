-- Minimal migration for request approval flow
-- Safe to run multiple times

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'skip pgcrypto extension: %', SQLERRM;
  END;
END $$;

CREATE TABLE IF NOT EXISTS user_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  type            VARCHAR(20) NOT NULL CHECK (type IN ('equipment', 'supply')),
  purpose         TEXT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled')),
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMP,
  rejected_reason TEXT,
  fulfilled_by    UUID REFERENCES users(id),
  fulfilled_at    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_request_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         UUID REFERENCES user_requests(id) ON DELETE CASCADE,
  item_type          VARCHAR(20) NOT NULL CHECK (item_type IN ('equipment', 'supply')),
  equipment_id       UUID REFERENCES equipment(id),
  stock_item_id      UUID REFERENCES stock_items(id),
  quantity           INT NOT NULL DEFAULT 1,
  notes              TEXT,
  booking_id         UUID,
  requisition_id     UUID,
  fulfilled_quantity INT,
  created_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_requests_status ON user_requests(status);
CREATE INDEX IF NOT EXISTS idx_user_requests_user_id ON user_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_request_items_request_id ON user_request_items(request_id);

