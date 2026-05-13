CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE booking_return_inspections (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id   UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  returned_by  UUID REFERENCES users(id),
  status       VARCHAR(50) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'completed', 'issue_found')),
  notes        TEXT DEFAULT '',
  checked_by   UUID REFERENCES users(id),
  checked_at   TIMESTAMP WITH TIME ZONE,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bri_booking ON booking_return_inspections(booking_id);
CREATE INDEX idx_bri_status  ON booking_return_inspections(status);
