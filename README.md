# ระบบจองอุปกรณ์ (Equipment Booking System)

ระบบจองและบริหารจัดการอุปกรณ์เครื่องมือเครื่องจักร พร้อมระบบสต็อกและการบำรุงรักษา

## 🎯 Features

### 1. ระบบ User Roles (4 บทบาท)
- **พนักงาน (Employee)** - จองอุปกรณ์, ดูประวัติการจอง
- **ผู้จัดการ (Manager)** - อนุมัติ/ไม่อนุมัติการจอง, ดูรายงาน
- **ช่างซ่อม (Technician)** - จัดการงานซ่อมบำรุง, อัพเดทสถานะ
- **แอดมิน (Admin)** - จัดการผู้ใช้, ตั้งค่าระบบ, เข้าถึงทุกฟังก์ชัน

### 2. ระบบจองอุปกรณ์
- ค้นหาและกรองอุปกรณ์ 1000+ รายการ
- จองตามช่วงเวลา (วันที่-เวลา)
- เลือกจำนวนที่ต้องการจอง
- ระบุวัตถุประสงค์การใช้งาน
- ติดตามสถานะการจอง (รออนุมัติ, อนุมัติแล้ว, กำลังใช้งาน, เสร็จสิ้น)

### 3. ระบบจัดการสต็อก
- แสดงจำนวนคงเหลือแบบ Real-time
- แจ้งเตือนเมื่อสต็อกใกล้หมด
- ติดตามสถานะอุปกรณ์ (พร้อมใช้งาน, ถูกจอง, กำลังใช้งาน, ซ่อมบำรุง)

### 4. ระบบซ่อมบำรุง
- กำหนดการบำรุงรักษาอัตโนมัติ
- แจ้งเตือนเมื่อถึงกำหนดซ่อม
- บันทึกประวัติการซ่อม, ค่าใช้จ่าย
- ติดตามสถานะงาน (กำหนดการ, กำลังดำเนินการ, เสร็จสิ้น, เกินกำหนด)

### 5. Dashboard
- สถิติภาพรวมระบบ
- การจองล่าสุด
- งานซ่อมบำรุงที่กำลังจะถึง
- อุปกรณ์ยอดนิยม

## 🚀 Tech Stack

- **Frontend**: Next.js 15 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Backend** (ที่จะพัฒนา): Nest.js, PostgreSQL

## 📁 โครงสร้างโปรเจกต์

```
equipment-booking/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx           # Dashboard
│   │   ├── equipment/         # หน้าอุปกรณ์ทั้งหมด
│   │   ├── bookings/          # การจองของฉัน
│   │   ├── approvals/         # อนุมัติการจอง (Manager)
│   │   ├── maintenance/       # งานซ่อมบำรุง (Technician)
│   │   ├── layout.tsx         # Root layout
│   │   └── globals.css        # Global styles
│   ├── components/            # Reusable components
│   │   ├── Sidebar.tsx        # Navigation sidebar
│   │   ├── StatsCard.tsx      # Dashboard stat cards
│   │   ├── EquipmentCard.tsx  # Equipment display card
│   │   └── BookingModal.tsx   # Booking form modal
│   ├── types/                 # TypeScript types
│   │   └── index.ts           # All type definitions
│   ├── lib/                   # Utilities
│   │   └── mockData.ts        # Mock data (1000+ items)
│   └── hooks/                 # Custom React hooks
├── public/                    # Static assets
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## 🛠️ การติดตั้งและรันโปรเจกต์

### 1. ติดตั้ง Dependencies

```bash
npm install
```

### 2. รัน Development Server

```bash
npm run dev
```

เปิดเบราว์เซอร์ที่ [http://localhost:3000](http://localhost:3000)

### 3. Build สำหรับ Production

```bash
npm run build
npm start
```

## 📝 Mock Data

โปรเจกต์นี้ใช้ Mock Data สำหรับการพัฒนา Frontend:
- อุปกรณ์ 1,000+ รายการ
- การจอง 50 รายการ
- งานซ่อมบำรุง 100 รายการ
- ผู้ใช้ 4 บทบาท

## 🔜 Next Steps (Backend Development)

### 1. ตั้งค่า Nest.js Backend
```bash
# สร้าง Nest.js project
nest new equipment-booking-api
cd equipment-booking-api

# ติดตั้ง dependencies
npm install @nestjs/typeorm typeorm pg
npm install @nestjs/passport passport passport-jwt
npm install bcrypt class-validator class-transformer
```

### 2. ออกแบบ Database Schema (PostgreSQL)

**Tables:**
- `users` - ข้อมูลผู้ใช้และบทบาท
- `equipment` - ข้อมูลอุปกรณ์
- `equipment_categories` - หมวดหมู่อุปกรณ์
- `bookings` - การจองอุปกรณ์
- `maintenance_records` - ประวัติการซ่อมบำรุง
- `maintenance_schedules` - กำหนดการซ่อมบำรุง
- `notifications` - การแจ้งเตือน

### 3. API Endpoints ที่ต้องพัฒนา

**Authentication:**
- `POST /auth/login` - เข้าสู่ระบบ
- `POST /auth/register` - ลงทะเบียน
- `GET /auth/me` - ข้อมูลผู้ใช้ปัจจุบัน

**Equipment:**
- `GET /equipment` - รายการอุปกรณ์ทั้งหมด (pagination, filter, search)
- `GET /equipment/:id` - รายละเอียดอุปกรณ์
- `POST /equipment` - เพิ่มอุปกรณ์ใหม่ (Admin)
- `PUT /equipment/:id` - แก้ไขอุปกรณ์ (Admin)
- `DELETE /equipment/:id` - ลบอุปกรณ์ (Admin)

**Bookings:**
- `GET /bookings` - รายการจองของฉัน
- `GET /bookings/:id` - รายละเอียดการจอง
- `POST /bookings` - สร้างการจองใหม่
- `PUT /bookings/:id` - อัพเดทการจอง
- `DELETE /bookings/:id` - ยกเลิกการจอง
- `POST /bookings/:id/approve` - อนุมัติการจอง (Manager)
- `POST /bookings/:id/reject` - ไม่อนุมัติการจอง (Manager)

**Maintenance:**
- `GET /maintenance` - รายการงานซ่อมบำรุง
- `GET /maintenance/:id` - รายละเอียดงานซ่อม
- `POST /maintenance` - สร้างงานซ่อมใหม่
- `PUT /maintenance/:id` - อัพเดทงานซ่อม
- `POST /maintenance/:id/start` - เริ่มงานซ่อม
- `POST /maintenance/:id/complete` - ทำงานเสร็จ

**Dashboard:**
- `GET /dashboard/stats` - สถิติภาพรวม

### 4. เชื่อมต่อ Frontend กับ Backend

```typescript
// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function fetchEquipment(params: {
  search?: string;
  category?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const queryParams = new URLSearchParams(params as any);
  const response = await fetch(`${API_URL}/equipment?${queryParams}`);
  return response.json();
}

// Similar functions for other endpoints...
```

## 🎨 Features ที่อาจเพิ่มเติม

- [ ] ระบบแจ้งเตือนแบบ Real-time (WebSocket)
- [ ] Export รายงานเป็น PDF/Excel
- [ ] ระบบ QR Code สำหรับอุปกรณ์
- [ ] Mobile App (React Native)
- [ ] การอัพโหลดรูปภาพอุปกรณ์
- [ ] ระบบรีวิวและให้คะแนนอุปกรณ์
- [ ] Integration กับระบบ Calendar
- [ ] Multi-language support

## 📄 License

MIT

## 👥 Contributors

- Frontend: Built with Next.js, TypeScript, Tailwind CSS
- Backend (Coming Soon): Nest.js + PostgreSQL
