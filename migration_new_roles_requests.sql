-- Migration: New roles + user_requests tables
-- Run this on Railway PostgreSQL

-- 1. Update users role constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'executive', 'dept_head', 'user'));

-- 2. Update existing demo users to new roles
UPDATE users SET role = 'dept_head' WHERE role = 'manager';
UPDATE users SET role = 'user'      WHERE role = 'employee';
-- technician → keep as user or remove (no longer needed)
UPDATE users SET role = 'user'      WHERE role = 'technician';

-- 3. Add new demo accounts
INSERT INTO users (email, name, password_hash, role, department, is_active)
VALUES
  ('executive@company.com', 'ผู้บริหาร ทดสอบ',  '$2b$10$1eyGHulkwGIzvZwYrG0QPuBfrep2FnP004qLYDWB2z4dsg0b4bCI2', 'executive', 'ฝ่ายบริหาร', true),
  ('depthead@company.com',  'หัวหน้าแผนก ทดสอบ', '$2b$10$1eyGHulkwGIzvZwYrG0QPuBfrep2FnP004qLYDWB2z4dsg0b4bCI2', 'dept_head', 'ฝ่ายผลิต',  true),
  ('user@company.com',      'ผู้ใช้ ทดสอบ',       '$2b$10$LkCEufmrHEf0pDBz9aGEzu5Gh6vuP3RMzWM/IsOBLnbLkETM5gJIq', 'user',      'ฝ่ายผลิต',  true)
ON CONFLICT (email) DO NOTHING;

-- 4. Create user_requests table
CREATE TABLE IF NOT EXISTS user_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  type          VARCHAR(20) NOT NULL CHECK (type IN ('equipment', 'supply')),
  purpose       TEXT NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled')),
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMP,
  rejected_reason TEXT,
  fulfilled_by  UUID REFERENCES users(id),
  fulfilled_at  TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- 5. Create user_request_items table
CREATE TABLE IF NOT EXISTS user_request_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID REFERENCES user_requests(id) ON DELETE CASCADE,
  item_type      VARCHAR(20) NOT NULL CHECK (item_type IN ('equipment', 'supply')),
  equipment_id   UUID REFERENCES equipment(id),
  stock_item_id  UUID REFERENCES stock_items(id),
  quantity       INT NOT NULL DEFAULT 1,
  notes          TEXT,
  -- filled after fulfillment
  booking_id         UUID REFERENCES bookings(id),
  requisition_id     UUID REFERENCES requisitions(id),
  fulfilled_quantity INT,
  created_at     TIMESTAMP DEFAULT NOW()
);
