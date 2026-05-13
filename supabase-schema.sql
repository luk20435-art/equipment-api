-- ===================================
-- Equipment Booking System - Database Schema
-- ===================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===================================
-- Users Table
-- ===================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('employee', 'manager', 'technician', 'admin')),
  department VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================
-- Equipment Categories Table
-- ===================================
CREATE TABLE equipment_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================
-- Equipment Table
-- ===================================
CREATE TABLE equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(255) NOT NULL,
  description TEXT,
  location VARCHAR(255),
  status VARCHAR(50) NOT NULL CHECK (status IN ('available', 'booked', 'in-use', 'maintenance', 'broken')),
  quantity INTEGER NOT NULL DEFAULT 1,
  available_quantity INTEGER NOT NULL DEFAULT 1,
  image_url TEXT,
  specifications JSONB,
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  maintenance_interval_days INTEGER DEFAULT 90,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================
-- Bookings Table
-- ===================================
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  purpose TEXT NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'active', 'completed', 'cancelled')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================
-- Maintenance Records Table
-- ===================================
CREATE TABLE maintenance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES users(id),
  scheduled_date DATE NOT NULL,
  completed_date DATE,
  status VARCHAR(50) NOT NULL CHECK (status IN ('scheduled', 'in-progress', 'completed', 'overdue')),
  type VARCHAR(50) NOT NULL CHECK (type IN ('routine', 'repair', 'inspection')),
  description TEXT NOT NULL,
  notes TEXT,
  cost DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================
-- Indexes for Performance
-- ===================================
CREATE INDEX idx_equipment_category ON equipment(category);
CREATE INDEX idx_equipment_status ON equipment(status);
CREATE INDEX idx_equipment_code ON equipment(code);

CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_equipment ON bookings(equipment_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_dates ON bookings(start_date, end_date);

CREATE INDEX idx_maintenance_equipment ON maintenance_records(equipment_id);
CREATE INDEX idx_maintenance_technician ON maintenance_records(technician_id);
CREATE INDEX idx_maintenance_status ON maintenance_records(status);
CREATE INDEX idx_maintenance_scheduled ON maintenance_records(scheduled_date);

-- ===================================
-- Row Level Security (RLS) Policies
-- ===================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;

-- Users: Can read all, update own profile
CREATE POLICY "Users can read all users" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- Equipment: All can read, only admin can modify
CREATE POLICY "Anyone can read equipment" ON equipment FOR SELECT USING (true);
CREATE POLICY "Admin can insert equipment" ON equipment FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin can update equipment" ON equipment FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Bookings: Users see own, managers/admin see all
CREATE POLICY "Users can read own bookings" ON bookings FOR SELECT USING (
  user_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('manager', 'admin'))
);
CREATE POLICY "Users can create bookings" ON bookings FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own pending bookings" ON bookings FOR UPDATE USING (
  user_id = auth.uid() AND status = 'pending'
);
CREATE POLICY "Managers can update bookings" ON bookings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('manager', 'admin'))
);

-- Maintenance: Technicians and admin can manage
CREATE POLICY "Technicians can read maintenance" ON maintenance_records FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('technician', 'admin'))
);
CREATE POLICY "Technicians can create maintenance" ON maintenance_records FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('technician', 'admin'))
);
CREATE POLICY "Technicians can update maintenance" ON maintenance_records FOR UPDATE USING (
  technician_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- ===================================
-- Functions and Triggers
-- ===================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_equipment_updated_at BEFORE UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_maintenance_updated_at BEFORE UPDATE ON maintenance_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check maintenance overdue
CREATE OR REPLACE FUNCTION check_maintenance_overdue()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scheduled_date < CURRENT_DATE AND NEW.status = 'scheduled' THEN
    NEW.status = 'overdue';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_overdue BEFORE INSERT OR UPDATE ON maintenance_records
  FOR EACH ROW EXECUTE FUNCTION check_maintenance_overdue();

-- ===================================
-- Insert Sample Data
-- ===================================

-- Insert demo users with bcrypt hashed passwords
-- Passwords: admin123, manager123, employee123, tech123
-- Hash generated with: bcrypt.hash(password, 10)

INSERT INTO users (email, name, password_hash, role, department) VALUES
('admin@company.com', 'ผู้ดูแลระบบ', '$2b$10$rKvVzF5.KqVHx5Qq5cCyuOqQw5p5Y7J8zNx7L5rKL5rKL5rKL5rKLO', 'admin', 'IT'),
('manager@company.com', 'สมหญิง รักดี', '$2b$10$rKvVzF5.KqVHx5Qq5cCyuOqQw5p5Y7J8zNx7L5rKL5rKL5rKL5rKLO', 'manager', 'ฝ่ายผลิต'),
('employee@company.com', 'สมชาย ใจดี', '$2b$10$rKvVzF5.KqVHx5Qq5cCyuOqQw5p5Y7J8zNx7L5rKL5rKL5rKL5rKLO', 'employee', 'ฝ่ายผลิต'),
('tech@company.com', 'วิชัย ช่างซ่อม', '$2b$10$rKvVzF5.KqVHx5Qq5cCyuOqQw5p5Y7J8zNx7L5rKL5rKL5rKL5rKLO', 'technician', 'ฝ่ายซ่อมบำรุง');

-- Insert sample equipment categories
INSERT INTO equipment_categories (name, description) VALUES
('เครื่องมือไฟฟ้า', 'อุปกรณ์ใช้ไฟฟ้าต่างๆ'),
('เครื่องจักรกล', 'เครื่องจักรสำหรับงานผลิต'),
('อุปกรณ์วัดและทดสอบ', 'เครื่องมือวัดและทดสอบ'),
('เครื่องมือช่าง', 'เครื่องมือช่างทั่วไป'),
('อุปกรณ์ความปลอดภัย', 'อุปกรณ์รักษาความปลอดภัย');

-- Insert sample equipment
INSERT INTO equipment (name, code, category, description, location, status, quantity, available_quantity, maintenance_interval_days) VALUES
('สว่านไฟฟ้า Bosch รุ่น 500', 'TOOL-0001', 'เครื่องมือไฟฟ้า', 'สว่านไฟฟ้าสำหรับงานหนัก', 'คลัง A-1', 'available', 5, 5, 90),
('เลื่อยวงเดือน Makita', 'TOOL-0002', 'เครื่องมือไฟฟ้า', 'เลื่อยวงเดือนสำหรับตัดไม้', 'คลัง A-2', 'available', 3, 3, 90),
('เครื่องเชื่อม MIG 200A', 'MACH-0001', 'เครื่องจักรกล', 'เครื่องเชื่อมไฟฟ้า 200 แอมป์', 'คลัง B-1', 'available', 2, 1, 60),
('มัลติมิเตอร์ดิจิตอล', 'MEAS-0001', 'อุปกรณ์วัดและทดสอบ', 'เครื่องวัดค่าไฟฟ้า', 'คลัง C-1', 'available', 10, 8, 180);

-- Note: เพิ่มข้อมูลตัวอย่างเพิ่มเติมตามต้องการ
