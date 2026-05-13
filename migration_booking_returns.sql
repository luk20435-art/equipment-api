-- ============================================================
-- Migration: Add booking_return_inspections table
-- Run this once in your PostgreSQL database
-- ============================================================

-- 1. Add 'returning' to bookings status CHECK constraint
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'active', 'completed', 'cancelled', 'returning'));

-- 2. Create booking_return_inspections table
CREATE TABLE IF NOT EXISTS booking_return_inspections (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id    UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  returned_by   UUID REFERENCES users(id),
  status        VARCHAR(50) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'completed', 'issue_found')),
  notes         TEXT DEFAULT '',
  checked_by    UUID REFERENCES users(id),
  checked_at    TIMESTAMP WITH TIME ZONE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bri_booking ON booking_return_inspections(booking_id);
CREATE INDEX IF NOT EXISTS idx_bri_status  ON booking_return_inspections(status);
