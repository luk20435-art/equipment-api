-- ===================================================
-- Equipment Booking System - Railway PostgreSQL Schema
-- Clean schema (no Supabase RLS) — run this once
-- ===================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===================================================
-- Users
-- ===================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(50)  NOT NULL CHECK (role IN ('employee', 'manager', 'technician', 'admin')),
  department    VARCHAR(255),
  avatar_url    TEXT,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================
-- Equipment Categories
-- ===================================================
CREATE TABLE IF NOT EXISTS equipment_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================
-- Equipment
-- ===================================================
CREATE TABLE IF NOT EXISTS equipment (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                     VARCHAR(255) NOT NULL,
  code                     VARCHAR(100) UNIQUE NOT NULL,
  category                 VARCHAR(255) NOT NULL,
  description              TEXT,
  location                 VARCHAR(255),
  status                   VARCHAR(50) NOT NULL CHECK (status IN ('available','booked','in-use','maintenance','broken')),
  quantity                 INTEGER NOT NULL DEFAULT 1,
  available_quantity       INTEGER NOT NULL DEFAULT 1,
  image_url                TEXT,
  specifications           JSONB,
  last_maintenance_date    DATE,
  next_maintenance_date    DATE,
  maintenance_interval_days INTEGER DEFAULT 90,
  created_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================
-- Equipment Units (individual serial-tracked units)
-- ===================================================
CREATE TABLE IF NOT EXISTS equipment_units (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id      UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  unit_no           INTEGER NOT NULL,
  unit_code         VARCHAR(100),
  serial_number     TEXT,
  status            VARCHAR(50) NOT NULL DEFAULT 'available'
                      CHECK (status IN ('available','in-use','maintenance','broken','retired')),
  total_usage_hours NUMERIC(10,2) DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================
-- Bookings
-- ===================================================
CREATE TABLE IF NOT EXISTS bookings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id     UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity         INTEGER NOT NULL DEFAULT 1,
  start_date       TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date         TIMESTAMP WITH TIME ZONE NOT NULL,
  purpose          TEXT NOT NULL,
  status           VARCHAR(50) NOT NULL
                     CHECK (status IN ('pending','approved','rejected','active','completed','cancelled','returning')),
  booking_source   VARCHAR(50) DEFAULT 'cart',
  approved_by      UUID REFERENCES users(id),
  approved_at      TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================
-- Booking Return Inspections
-- ===================================================
CREATE TABLE IF NOT EXISTS booking_return_inspections (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  returned_by UUID REFERENCES users(id),
  status      VARCHAR(50) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','completed','issue_found')),
  notes       TEXT DEFAULT '',
  checked_by  UUID REFERENCES users(id),
  checked_at  TIMESTAMP WITH TIME ZONE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================
-- Maintenance Records
-- ===================================================
CREATE TABLE IF NOT EXISTS maintenance_records (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id   UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  unit_id        UUID REFERENCES equipment_units(id) ON DELETE SET NULL,
  technician_id  UUID NOT NULL REFERENCES users(id),
  scheduled_date DATE NOT NULL,
  completed_date DATE,
  status         VARCHAR(50) NOT NULL
                   CHECK (status IN ('scheduled','in-progress','completed','overdue')),
  type           VARCHAR(50) NOT NULL
                   CHECK (type IN ('routine','repair','inspection')),
  description    TEXT NOT NULL,
  notes          TEXT,
  cost           DECIMAL(10,2),
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================
-- Brands (master data)
-- ===================================================
CREATE TABLE IF NOT EXISTS brands (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) UNIQUE NOT NULL,
  logo_url      TEXT,
  website_url   TEXT,
  display_order INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================
-- Projects (master data)
-- ===================================================
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(100) UNIQUE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  status      VARCHAR(50) DEFAULT 'active'
                CHECK (status IN ('active','completed','on_hold','cancelled')),
  start_date  DATE,
  end_date    DATE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================
-- Warehouses (master data)
-- ===================================================
CREATE TABLE IF NOT EXISTS warehouses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  location    VARCHAR(255),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================
-- Stock Items (consumable / small parts inventory)
-- ===================================================
CREATE TABLE IF NOT EXISTS stock_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(255) NOT NULL,
  code         VARCHAR(100) UNIQUE NOT NULL,
  category     VARCHAR(255),
  unit         VARCHAR(50) NOT NULL DEFAULT 'ชิ้น',
  quantity     INTEGER NOT NULL DEFAULT 0,
  min_quantity INTEGER NOT NULL DEFAULT 0,
  location     VARCHAR(255),
  description  TEXT,
  image_url    TEXT,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================
-- Requisitions (stock draw requests)
-- ===================================================
CREATE TABLE IF NOT EXISTS requisitions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id),
  project_id   UUID REFERENCES projects(id),
  warehouse_id UUID REFERENCES warehouses(id),
  status       VARCHAR(50) DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','completed','cancelled')),
  notes        TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS requisition_items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  stock_item_id  UUID REFERENCES stock_items(id),
  quantity       INTEGER NOT NULL DEFAULT 1,
  notes          TEXT,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================
-- Indexes
-- ===================================================
CREATE INDEX IF NOT EXISTS idx_equipment_category  ON equipment(category);
CREATE INDEX IF NOT EXISTS idx_equipment_status    ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_code      ON equipment(code);

CREATE INDEX IF NOT EXISTS idx_equipment_units_eq  ON equipment_units(equipment_id);

CREATE INDEX IF NOT EXISTS idx_bookings_user       ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_equipment  ON bookings(equipment_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status     ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_dates      ON bookings(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_bookings_source     ON bookings(booking_source);

CREATE INDEX IF NOT EXISTS idx_bri_booking         ON booking_return_inspections(booking_id);
CREATE INDEX IF NOT EXISTS idx_bri_status          ON booking_return_inspections(status);

CREATE INDEX IF NOT EXISTS idx_maintenance_equip   ON maintenance_records(equipment_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tech    ON maintenance_records(technician_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status  ON maintenance_records(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_sched   ON maintenance_records(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_unit    ON maintenance_records(unit_id);

CREATE INDEX IF NOT EXISTS idx_stock_code          ON stock_items(code);
CREATE INDEX IF NOT EXISTS idx_requisitions_user   ON requisitions(user_id);
CREATE INDEX IF NOT EXISTS idx_req_items_req       ON requisition_items(requisition_id);

-- ===================================================
-- Triggers (auto-update updated_at)
-- ===================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
    CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_equipment_updated_at') THEN
    CREATE TRIGGER update_equipment_updated_at
      BEFORE UPDATE ON equipment
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_bookings_updated_at') THEN
    CREATE TRIGGER update_bookings_updated_at
      BEFORE UPDATE ON bookings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_maintenance_updated_at') THEN
    CREATE TRIGGER update_maintenance_updated_at
      BEFORE UPDATE ON maintenance_records
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ===================================================
-- Overdue maintenance trigger
-- ===================================================
CREATE OR REPLACE FUNCTION check_maintenance_overdue()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scheduled_date < CURRENT_DATE AND NEW.status = 'scheduled' THEN
    NEW.status = 'overdue';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'check_overdue') THEN
    CREATE TRIGGER check_overdue
      BEFORE INSERT OR UPDATE ON maintenance_records
      FOR EACH ROW EXECUTE FUNCTION check_maintenance_overdue();
  END IF;
END $$;

-- ===================================================
-- Seed Data
-- Passwords: admin123 / manager123 / employee123 / tech123
-- ===================================================
INSERT INTO users (email, name, password_hash, role, department, is_active) VALUES
('admin@company.com',    'ผู้ดูแลระบบ',     '$2b$10$2Qqx0t6wTDEQGfJMhpwW/eznsSSWwQ2F/f4N3Wz7aT/zOb.9CRX.a', 'admin',      'IT',                true),
('manager@company.com',  'สมหญิง รักดี',   '$2b$10$1eyGHulkwGIzvZwYrG0QPuBfrep2FnP004qLYDWB2z4dsg0b4bCI2', 'manager',    'ฝ่ายผลิต',        true),
('employee@company.com', 'สมชาย ใจดี',     '$2b$10$LkCEufmrHEf0pDBz9aGEzu5Gh6vuP3RMzWM/IsOBLnbLkETM5gJIq', 'employee',   'ฝ่ายผลิต',        true),
('tech@company.com',     'วิชัย ช่างซ่อม', '$2b$10$q87FBah37vP5W9HNgnvQwOr2/196ponDix2XUo49AfydKqrEms9La', 'technician', 'ฝ่ายซ่อมบำรุง',  true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO equipment_categories (name, description) VALUES
('เครื่องมือไฟฟ้า',         'อุปกรณ์ใช้ไฟฟ้าต่างๆ'),
('เครื่องจักรกล',           'เครื่องจักรสำหรับงานผลิต'),
('อุปกรณ์วัดและทดสอบ',     'เครื่องมือวัดและทดสอบ'),
('เครื่องมือช่าง',          'เครื่องมือช่างทั่วไป'),
('อุปกรณ์ความปลอดภัย',     'อุปกรณ์รักษาความปลอดภัย')
ON CONFLICT (name) DO NOTHING;

INSERT INTO equipment (name, code, category, description, location, status, quantity, available_quantity, maintenance_interval_days) VALUES
('สว่านไฟฟ้า Bosch รุ่น 500',  'TOOL-0001', 'เครื่องมือไฟฟ้า',      'สว่านไฟฟ้าสำหรับงานหนัก',     'คลัง A-1', 'available', 5,  5,  90),
('เลื่อยวงเดือน Makita',        'TOOL-0002', 'เครื่องมือไฟฟ้า',      'เลื่อยวงเดือนสำหรับตัดไม้',   'คลัง A-2', 'available', 3,  3,  90),
('เครื่องเชื่อม MIG 200A',      'MACH-0001', 'เครื่องจักรกล',        'เครื่องเชื่อมไฟฟ้า 200 แอมป์','คลัง B-1', 'available', 2,  2,  60),
('มัลติมิเตอร์ดิจิตอล',         'MEAS-0001', 'อุปกรณ์วัดและทดสอบ',  'เครื่องวัดค่าไฟฟ้า',          'คลัง C-1', 'available', 10, 10, 180)
ON CONFLICT (code) DO NOTHING;
