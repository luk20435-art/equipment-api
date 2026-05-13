ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES equipment_units(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_unit ON maintenance_records(unit_id);
