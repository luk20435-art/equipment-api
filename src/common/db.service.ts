import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class DbService {
  private pool: Pool;

  constructor(private configService: ConfigService) {
    this.pool = new Pool({
      host: this.configService.get<string>('DB_HOST') || 'localhost',
      port: parseInt(this.configService.get<string>('DB_PORT') || '5432'),
      database: this.configService.get<string>('DB_NAME') || 'equipment_booking',
      user: this.configService.get<string>('DB_USER') || 'postgres',
      password: this.configService.get<string>('DB_PASSWORD'),
    });

    this.pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err.message);
    });

    console.log('--- Database Config ---');
    console.log(`Host: ${this.configService.get('DB_HOST') || 'localhost'}:${this.configService.get('DB_PORT') || 5432}`);
    console.log(`Database: ${this.configService.get('DB_NAME') || 'equipment_booking'}`);
    console.log('----------------------');

    this.pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_source VARCHAR(50) DEFAULT 'cart'`).catch(() => {});
    this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => {});
  }

  private snakeToCamel(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map(item => this.snakeToCamel(item));
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelKey] = this.snakeToCamel(obj[key]);
      return result;
    }, {} as any);
  }

  private async query<T = any>(
    sql: string,
    params?: any[],
  ): Promise<{ data: T | null; error: { message: string } | null; count?: number }> {
    try {
      const result = await this.pool.query(sql, params);
      return { data: this.snakeToCamel(result.rows) as unknown as T, error: null, count: result.rowCount ?? undefined };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  }

  private async queryOne<T = any>(
    sql: string,
    params?: any[],
  ): Promise<{ data: T | null; error: { message: string } | null }> {
    try {
      const result = await this.pool.query(sql, params);
      if (result.rows.length === 0) {
        return { data: null, error: { message: 'Record not found' } };
      }
      return { data: this.snakeToCamel(result.rows[0]) as unknown as T, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  }

  // Equipment queries
  async getEquipment(filters?: {
    search?: string;
    category?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (filters?.search) {
      conditions.push(`(name ILIKE $${paramIdx} OR code ILIKE $${paramIdx} OR category ILIKE $${paramIdx})`);
      params.push(`%${filters.search}%`);
      paramIdx++;
    }

    if (filters?.category && filters.category !== 'all') {
      conditions.push(`category = $${paramIdx}`);
      params.push(filters.category);
      paramIdx++;
    }

    if (filters?.status && filters.status !== 'all') {
      conditions.push(`status = $${paramIdx}`);
      params.push(filters.status);
      paramIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;

    try {
      const countResult = await this.pool.query(
        `SELECT COUNT(*) FROM equipment ${where}`,
        params,
      );
      const count = parseInt(countResult.rows[0].count, 10);

      const dataResult = await this.pool.query(
        `SELECT * FROM equipment ${where} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset],
      );

      return { data: this.snakeToCamel(dataResult.rows), error: null, count };
    } catch (err: any) {
      return { data: null, error: { message: err.message }, count: 0 };
    }
  }

  async getEquipmentById(id: string) {
    return this.queryOne(`SELECT * FROM equipment WHERE id = $1`, [id]);
  }

  async createEquipment(data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const cols = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    return this.queryOne(
      `INSERT INTO equipment (${cols}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
  }

  async updateEquipment(id: string, data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    return this.queryOne(
      `UPDATE equipment SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id],
    );
  }

  async deleteEquipment(id: string) {
    return this.query(`DELETE FROM equipment WHERE id = $1`, [id]);
  }

  // Booking queries
  async getBookings(userId?: string, filters?: any) {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (userId) {
      conditions.push(`b.user_id = $${paramIdx}`);
      params.push(userId);
      paramIdx++;
    }

    if (filters?.status && filters.status !== 'all') {
      conditions.push(`b.status = $${paramIdx}`);
      params.push(filters.status);
      paramIdx++;
    }

    if (filters?.source) {
      conditions.push(`COALESCE(b.booking_source, 'cart') = $${paramIdx}`);
      params.push(filters.source);
      paramIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT b.*,
        row_to_json(e.*) as equipment,
        row_to_json(u.*) as "user",
        row_to_json(a.*) as approver
      FROM bookings b
      LEFT JOIN equipment e ON b.equipment_id = e.id
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN users a ON b.approved_by = a.id
      ${where}
      ORDER BY b.created_at DESC
    `;

    return this.query(sql, params);
  }

  async getBookingById(id: string) {
    const sql = `
      SELECT b.*,
        row_to_json(e.*) as equipment,
        row_to_json(u.*) as "user",
        row_to_json(a.*) as approver
      FROM bookings b
      LEFT JOIN equipment e ON b.equipment_id = e.id
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN users a ON b.approved_by = a.id
      WHERE b.id = $1
    `;
    return this.queryOne(sql, [id]);
  }

  async createBooking(data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const cols = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    return this.queryOne(
      `INSERT INTO bookings (${cols}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
  }

  async updateBooking(id: string, data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    return this.queryOne(
      `UPDATE bookings SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id],
    );
  }

  async approveBooking(id: string, approverId: string | null) {
    return this.queryOne(
      `UPDATE bookings SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *`,
      [approverId, id],
    );
  }

  async rejectBooking(id: string, reason: string) {
    return this.queryOne(
      `UPDATE bookings SET status = 'rejected', rejection_reason = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [reason, id],
    );
  }

  // Maintenance queries
  async getMaintenance(filters?: any) {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (filters?.status && filters.status !== 'all') {
      conditions.push(`m.status = $${paramIdx}`);
      params.push(filters.status);
      paramIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT m.*,
        row_to_json(e.*) as equipment,
        row_to_json(u.*) as technician
      FROM maintenance_records m
      LEFT JOIN equipment e ON m.equipment_id = e.id
      LEFT JOIN users u ON m.technician_id = u.id
      ${where}
      ORDER BY m.scheduled_date ASC
    `;

    return this.query(sql, params);
  }

  async createMaintenance(data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const cols = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    return this.queryOne(
      `INSERT INTO maintenance_records (${cols}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
  }

  async updateMaintenance(id: string, data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    return this.queryOne(
      `UPDATE maintenance_records SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id],
    );
  }

  async completeMaintenance(id: string, notes?: string, cost?: number) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update maintenance record to completed
      const result = await client.query(
        `UPDATE maintenance_records
         SET status = 'completed', completed_date = NOW(), notes = COALESCE($1, notes), cost = COALESCE($2, cost), updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [notes ?? null, cost ?? null, id],
      );
      if (result.rows.length === 0) throw new Error('Maintenance record not found');

      const record = result.rows[0];

      // If the record has a unit_id, set unit back to available
      if (record.unit_id) {
        await client.query(
          `UPDATE equipment_units SET status = 'available', updated_at = NOW() WHERE id = $1`,
          [record.unit_id],
        );
        // Recalculate equipment available_quantity
        await client.query(
          `UPDATE equipment
           SET available_quantity = (
             SELECT COUNT(*) FROM equipment_units
             WHERE equipment_id = $1 AND status = 'available'
           ), updated_at = NOW()
           WHERE id = $1`,
          [record.equipment_id],
        );
      }

      await client.query('COMMIT');
      return { data: this.snakeToCamel(record), error: null };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return { data: null, error: { message: err.message } };
    } finally {
      client.release();
    }
  }

  // Dashboard stats
  async getDashboardStats() {
    const [equipmentCount, availableCount, activeBookings, pendingApprovals] =
      await Promise.all([
        this.pool.query(`SELECT COUNT(*) as count FROM equipment`),
        this.pool.query(`SELECT COUNT(*) as count FROM equipment WHERE status = 'available'`),
        this.pool.query(`SELECT COUNT(*) as count FROM bookings WHERE status = 'active'`),
        this.pool.query(`SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'`),
      ]);

    return {
      totalEquipment: parseInt(equipmentCount.rows[0].count, 10),
      availableEquipment: parseInt(availableCount.rows[0].count, 10),
      activeBookings: parseInt(activeBookings.rows[0].count, 10),
      pendingApprovals: parseInt(pendingApprovals.rows[0].count, 10),
    };
  }

  // User queries
  async getUserById(id: string) {
    return this.queryOne(`SELECT * FROM users WHERE id = $1`, [id]);
  }

  async getUserByEmail(email: string) {
    return this.queryOne(`SELECT * FROM users WHERE email = $1`, [email]);
  }

  async createUser(data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const cols = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    return this.queryOne(
      `INSERT INTO users (${cols}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
  }

  async updateUser(id: string, data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    return this.queryOne(
      `UPDATE users SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id],
    );
  }
}
