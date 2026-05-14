import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class DataService {
  private pool: Pool;

  constructor(private configService: ConfigService) {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      this.pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    } else {
      this.pool = new Pool({
        host: this.configService.get<string>('DB_HOST') || 'localhost',
        port: parseInt(this.configService.get<string>('DB_PORT') || '5432'),
        database: this.configService.get<string>('DB_NAME') || 'equipment_booking',
        user: this.configService.get<string>('DB_USER') || 'postgres',
        password: this.configService.get<string>('DB_PASSWORD'),
      });
    }
  }

  private snakeToCamel(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map((item) => this.snakeToCamel(item));
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelKey] = this.snakeToCamel(obj[key]);
      return result;
    }, {} as any);
  }

  private async query(sql: string, params?: any[]) {
    const result = await this.pool.query(sql, params);
    return this.snakeToCamel(result.rows);
  }

  private async queryOne(sql: string, params?: any[]) {
    const result = await this.pool.query(sql, params);
    return this.snakeToCamel(result.rows[0] || null);
  }

  private toLegacyRole(role?: string): string {
    if (!role) return 'employee';
    if (role === 'admin') return 'admin';
    if (role === 'executive') return 'manager';
    if (role === 'dept_head') return 'technician';
    if (role === 'user') return 'employee';
    return role;
  }

  private toAppRole(role?: string): string {
    if (!role) return 'user';
    if (role === 'admin') return 'admin';
    if (role === 'manager') return 'executive';
    if (role === 'technician') return 'dept_head';
    if (role === 'employee') return 'user';
    return role;
  }

  // Stock Items
  async getStockItems(filters?: { search?: string; category?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters?.search) {
      conditions.push(`(name ILIKE $${idx} OR code ILIKE $${idx} OR category ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }
    if (filters?.category) {
      conditions.push(`category = $${idx}`);
      params.push(filters.category);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.query(
      `SELECT * FROM stock_items ${where} ORDER BY name`,
      params,
    );
  }

  async getStockItemById(id: string) {
    return this.queryOne(`SELECT * FROM stock_items WHERE id = $1`, [id]);
  }

  async createStockItem(data: any) {
    const allowed = ['name','code','category','unit','quantity','min_quantity','location','description','image_url'];
    const entries = Object.entries(data).filter(([k, v]) => allowed.includes(k) && v !== undefined);
    if (entries.length === 0) throw new Error('No valid fields provided');
    const keys = entries.map(([k]) => k);
    const values = entries.map(([, v]) => v);
    const cols = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    try {
      return await this.queryOne(
        `INSERT INTO stock_items (${cols}) VALUES (${placeholders}) RETURNING *`,
        values,
      );
    } catch (err: any) {
      if (err.code === '23505') throw new Error(`รหัสสินค้า "${data.code}" มีอยู่แล้ว กรุณาใช้รหัสอื่น`);
      throw err;
    }
  }

  async getNextStockCode(): Promise<string> {
    const result = await this.pool.query(
      `SELECT code FROM stock_items WHERE code ~* '^ST[0-9]+$' ORDER BY code DESC LIMIT 1`
    );
    if (result.rows.length === 0) return 'ST001';
    const last = result.rows[0].code.toUpperCase().replace('ST', '');
    const next = parseInt(last, 10) + 1;
    return `ST${String(next).padStart(3, '0')}`;
  }

  async updateStockItem(id: string, data: any) {
    const allowed = ['name','code','category','unit','quantity','min_quantity','location','description','image_url'];
    const entries = Object.entries(data).filter(([k, v]) => allowed.includes(k) && v !== undefined);
    if (entries.length === 0) throw new Error('No valid fields provided');
    const keys = entries.map(([k]) => k);
    const values = entries.map(([, v]) => v);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    return this.queryOne(
      `UPDATE stock_items SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id],
    );
  }

  async deleteStockItem(id: string) {
    return this.queryOne(`DELETE FROM stock_items WHERE id = $1 RETURNING *`, [id]);
  }

  // Requisitions
  async getRequisitions(filters?: { status?: string; userId?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters?.status && filters.status !== 'all') {
      conditions.push(`r.status = $${idx}`);
      params.push(filters.status);
      idx++;
    }
    if (filters?.userId && this.isUuid(filters.userId)) {
      conditions.push(`r.user_id = $${idx}`);
      params.push(filters.userId);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT r.*,
        row_to_json(u.*) as "user",
        COALESCE(
          (SELECT json_agg(ri.* ORDER BY ri.created_at)
           FROM requisition_items ri WHERE ri.requisition_id = r.id),
          '[]'
        ) as items
      FROM requisitions r
      LEFT JOIN users u ON r.user_id = u.id
      ${where}
      ORDER BY r.created_at DESC
    `;
    return this.query(sql, params);
  }

  async createRequisition(data: any) {
    const { items, ...requisitionData } = data;
    const keys = Object.keys(requisitionData);
    const values = Object.values(requisitionData);
    const cols = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const requisition = await this.queryOne(
      `INSERT INTO requisitions (${cols}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    if (items?.length && requisition) {
      for (const item of items) {
        const iKeys = Object.keys(item);
        const iVals = Object.values(item);
        await this.pool.query(
          `INSERT INTO requisition_items (requisition_id, ${iKeys.join(', ')}) VALUES ($1, ${iKeys.map((_, i) => `$${i + 2}`).join(', ')})`,
          [requisition.id, ...iVals],
        );
      }
    }
    return requisition;
  }

  async updateRequisition(id: string, data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    return this.queryOne(
      `UPDATE requisitions SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id],
    );
  }

  // Booking Returns
  async getBookingReturns(filters?: { status?: string; userId?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters?.status && filters.status !== 'all') {
      conditions.push(`bri.status = $${idx}`);
      params.push(filters.status);
      idx++;
    }
    if (filters?.userId && this.isUuid(filters.userId)) {
      conditions.push(`b.user_id = $${idx}`);
      params.push(filters.userId);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      return await this.query(
        `SELECT bri.*,
           row_to_json(b.*) as booking,
           row_to_json(e.*) as equipment,
           row_to_json(u.*) as "user"
         FROM booking_return_inspections bri
         LEFT JOIN bookings b ON bri.booking_id = b.id
         LEFT JOIN equipment e ON b.equipment_id = e.id
         LEFT JOIN users u ON b.user_id = u.id
         ${where}
         ORDER BY bri.created_at DESC`,
        params,
      );
    } catch {
      // Fallback: simple query without joins (if booking_id column doesn't exist yet)
      const simpleConditions: string[] = [];
      const simpleParams: any[] = [];
      if (filters?.status && filters.status !== 'all') {
        simpleConditions.push(`status = $1`);
        simpleParams.push(filters.status);
      }
      const simpleWhere = simpleConditions.length ? `WHERE ${simpleConditions.join(' AND ')}` : '';
      return this.query(
        `SELECT * FROM booking_return_inspections ${simpleWhere} ORDER BY created_at DESC`,
        simpleParams,
      );
    }
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  async createBookingReturn(data: {
    booking_id: string;
    returned_by: string;
    condition: string;
    notes?: string;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const safeReturnedBy = this.isUuid(data.returned_by) ? data.returned_by : null;

      const result = await client.query(
        `INSERT INTO booking_return_inspections
           (booking_id, status, notes, returned_by, created_at)
         VALUES ($1, 'pending', $2, $3, NOW())
         RETURNING *`,
        [data.booking_id, data.notes ?? '', safeReturnedBy],
      );

      await client.query(
        `UPDATE bookings SET status = 'returning', updated_at = NOW() WHERE id = $1`,
        [data.booking_id],
      );

      await client.query('COMMIT');
      return this.snakeToCamel(result.rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async inspectBookingReturn(id: string, data: { status: 'completed' | 'issue_found'; notes?: string; checked_by?: string }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const safeCheckedBy = data.checked_by && this.isUuid(data.checked_by) ? data.checked_by : null;

      const result = await client.query(
        `UPDATE booking_return_inspections
         SET status = $1, notes = COALESCE($2, notes), checked_by = COALESCE($3, checked_by), checked_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [data.status, data.notes ?? null, safeCheckedBy, id],
      );

      if (result.rows.length === 0) throw new Error('Inspection not found');

      await client.query(
        `UPDATE bookings SET status = 'completed', updated_at = NOW()
         WHERE id = (SELECT booking_id FROM booking_return_inspections WHERE id = $1)`,
        [id],
      );

      await client.query('COMMIT');
      return this.snakeToCamel(result.rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Brands
  async getBrands() {
    return this.query(`SELECT * FROM brands ORDER BY display_order ASC, name ASC`);
  }

  async createBrand(data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const cols = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    return this.queryOne(
      `INSERT INTO brands (${cols}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
  }

  async updateBrand(id: string, data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    return this.queryOne(
      `UPDATE brands SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id],
    );
  }

  async deleteBrand(id: string) {
    await this.pool.query(`DELETE FROM brands WHERE id = $1`, [id]);
    return { message: 'Deleted' };
  }

  // Projects
  async getProjects(filters?: { status?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters?.status && filters.status !== 'all') {
      conditions.push(`status = $${idx}`);
      params.push(filters.status);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.query(`SELECT * FROM projects ${where} ORDER BY created_at DESC`, params);
  }

  async createProject(data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const cols = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    return this.queryOne(
      `INSERT INTO projects (${cols}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
  }

  async updateProject(id: string, data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    return this.queryOne(
      `UPDATE projects SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id],
    );
  }

  // Warehouses
  async getWarehouses() {
    return this.query(`SELECT * FROM warehouses ORDER BY name`);
  }

  async getDashboardStats() {
    const [equipment, bookings, maintenance, stock] = await Promise.all([
      this.pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'available') AS available FROM equipment`),
      this.pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending, COUNT(*) FILTER (WHERE status = 'active') AS active FROM bookings`),
      this.pool.query(`SELECT COUNT(*) FILTER (WHERE status IN ('scheduled','in-progress')) AS active FROM maintenance_records`),
      this.pool.query(`SELECT COUNT(*) AS total FROM stock_items`).catch(() => ({ rows: [{ total: 0 }] })),
    ]);
    return {
      totalEquipment: parseInt(equipment.rows[0].total, 10),
      availableEquipment: parseInt(equipment.rows[0].available, 10),
      pendingBookings: parseInt(bookings.rows[0].pending, 10),
      activeBookings: parseInt(bookings.rows[0].active, 10),
      activeMaintenance: parseInt(maintenance.rows[0].active, 10),
      totalStockItems: parseInt(stock.rows[0].total, 10),
    };
  }

  // Equipment Units
  async createEquipmentUnit(data: { equipment_id: string; unit_code?: string; serial_number?: string; notes?: string }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const maxResult = await client.query(
        `SELECT COALESCE(MAX(unit_no), 0) + 1 AS next_no FROM equipment_units WHERE equipment_id = $1`,
        [data.equipment_id],
      );
      const nextNo = maxResult.rows[0].next_no;
      const unitResult = await client.query(
        `INSERT INTO equipment_units (equipment_id, unit_no, unit_code, serial_number, status, notes)
         VALUES ($1, $2, $3, $4, 'available', $5) RETURNING *`,
        [data.equipment_id, nextNo, data.unit_code ?? null, data.serial_number ?? null, data.notes ?? null],
      );
      await client.query(
        `UPDATE equipment SET quantity = quantity + 1, available_quantity = available_quantity + 1 WHERE id = $1`,
        [data.equipment_id],
      );
      await client.query('COMMIT');
      return this.snakeToCamel(unitResult.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteEquipmentUnit(id: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const unitResult = await client.query(
        `DELETE FROM equipment_units WHERE id = $1 RETURNING *`, [id],
      );
      if (unitResult.rows.length > 0) {
        const unit = unitResult.rows[0];
        const availableDelta = unit.status === 'available' ? 1 : 0;
        await client.query(
          `UPDATE equipment SET quantity = GREATEST(0, quantity - 1), available_quantity = GREATEST(0, available_quantity - $1) WHERE id = $2`,
          [availableDelta, unit.equipment_id],
        );
      }
      await client.query('COMMIT');
      return this.snakeToCamel(unitResult.rows[0] ?? null);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateEquipmentUnit(id: string, data: { unit_code?: string; serial_number?: string; total_usage_hours?: number; notes?: string; status?: string }) {
    const keys = Object.keys(data).filter((k) => (data as any)[k] !== undefined);
    if (keys.length === 0) return this.queryOne(`SELECT * FROM equipment_units WHERE id = $1`, [id]);
    const values = keys.map((k) => (data as any)[k]);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    return this.queryOne(
      `UPDATE equipment_units SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id],
    );
  }

  async getEquipmentUnits(filters?: { equipmentId?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters?.equipmentId) {
      conditions.push(`eu.equipment_id = $${idx}`);
      params.push(filters.equipmentId);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    // Sync equipment quantity to match actual unit count
    if (filters?.equipmentId) {
      await this.pool.query(
        `UPDATE equipment SET
           quantity = (SELECT COUNT(*) FROM equipment_units WHERE equipment_id = $1),
           available_quantity = (SELECT COUNT(*) FROM equipment_units WHERE equipment_id = $1 AND status = 'available')
         WHERE id = $1`,
        [filters.equipmentId],
      );
    }
    const sql = `
      SELECT eu.*,
        (SELECT COUNT(*) FROM bookings b
         WHERE b.equipment_id = eu.equipment_id
           AND b.status IN ('completed','active')
        ) AS booking_count,
        row_to_json(e.*) AS equipment
      FROM equipment_units eu
      LEFT JOIN equipment e ON eu.equipment_id = e.id
      ${where}
      ORDER BY eu.unit_no
    `;
    return this.query(sql, params);
  }

  // Users
  async getUsers() {
    const rows = await this.query(`SELECT id, name, email, role, department, is_active, created_at FROM users ORDER BY name`);
    return Array.isArray(rows)
      ? rows.map((u: any) => ({ ...u, role: this.toAppRole(u.role) }))
      : rows;
  }

  async createUserAccount(data: { name: string; email: string; role: string; department?: string; password_hash: string }) {
    try {
      const row = await this.queryOne(
        `INSERT INTO users (id, name, email, role, department, is_active, password_hash, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5, NOW(), NOW()) RETURNING id, name, email, role, department, is_active, created_at`,
        [data.name, data.email, data.role, data.department ?? null, data.password_hash],
      );
      return row ? { ...row, role: this.toAppRole((row as any).role) } : row;
    } catch (err: any) {
      if (err?.code === '23514' && String(err?.constraint || '').includes('users_role_check')) {
        const legacyRole = this.toLegacyRole(data.role);
        const row = await this.queryOne(
          `INSERT INTO users (id, name, email, role, department, is_active, password_hash, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5, NOW(), NOW()) RETURNING id, name, email, role, department, is_active, created_at`,
          [data.name, data.email, legacyRole, data.department ?? null, data.password_hash],
        );
        return row ? { ...row, role: this.toAppRole((row as any).role) } : row;
      }
      throw err;
    }
  }

  async updateUserAccount(id: string, data: { name?: string; role?: string; department?: string; is_active?: boolean }) {
    const keys = Object.keys(data).filter((k) => (data as any)[k] !== undefined);
    if (keys.length === 0) return this.queryOne(`SELECT id, name, email, role, department, is_active FROM users WHERE id = $1`, [id]);
    const values = keys.map((k) => (k === 'role' ? (data as any)[k] : (data as any)[k]));
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    try {
      const row = await this.queryOne(
        `UPDATE users SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING id, name, email, role, department, is_active`,
        [...values, id],
      );
      return row ? { ...row, role: this.toAppRole((row as any).role) } : row;
    } catch (err: any) {
      if (err?.code === '23514' && String(err?.constraint || '').includes('users_role_check') && data.role) {
        const legacyData = { ...data, role: this.toLegacyRole(data.role) };
        const legacyValues = keys.map((k) => (legacyData as any)[k]);
        const row = await this.queryOne(
          `UPDATE users SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING id, name, email, role, department, is_active`,
          [...legacyValues, id],
        );
        return row ? { ...row, role: this.toAppRole((row as any).role) } : row;
      }
      throw err;
    }
  }

  async deleteUser(id: string) {
    await this.pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    return { message: 'Deleted' };
  }

  async getPermissions() {
    const result = await this.pool.query(`SELECT value FROM settings WHERE key = 'role_permissions'`);
    if (result.rows.length === 0) return defaultPermissions;
    return result.rows[0].value;
  }

  async savePermissions(permissions: Record<string, string[]>) {
    await this.pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('role_permissions', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(permissions)],
    );
    return { message: 'Saved' };
  }

  // ============================================================
  // User Requests (ผู้ใช้ขอใช้อุปกรณ์/วัสดุ)
  // ============================================================

  async getUserRequests(filters?: { status?: string; userId?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (filters?.status) { conditions.push(`r.status = $${idx++}`); params.push(filters.status); }
    if (filters?.userId) { conditions.push(`r.user_id = $${idx++}`); params.push(filters.userId); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const rows = await this.pool.query(`
      SELECT r.*,
        u.name AS user_name, u.email AS user_email, u.department AS user_department,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ri.id, 'item_type', ri.item_type,
              'quantity', ri.quantity, 'notes', ri.notes,
              'equipment_id', ri.equipment_id, 'stock_item_id', ri.stock_item_id,
              'equipment_name', eq.name, 'equipment_code', eq.code,
              'stock_name', si.name, 'stock_code', si.code, 'stock_unit', si.unit,
              'booking_id', ri.booking_id, 'requisition_id', ri.requisition_id,
              'fulfilled_quantity', ri.fulfilled_quantity
            ) ORDER BY ri.created_at
          ) FILTER (WHERE ri.id IS NOT NULL), '[]'
        ) AS items
      FROM user_requests r
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN user_request_items ri ON ri.request_id = r.id
      LEFT JOIN equipment eq ON eq.id = ri.equipment_id
      LEFT JOIN stock_items si ON si.id = ri.stock_item_id
      ${where}
      GROUP BY r.id, u.name, u.email, u.department
      ORDER BY r.created_at DESC
    `, params);
    return this.snakeToCamel(rows.rows);
  }

  async createUserRequest(data: {
    user_id: string;
    type: string;
    purpose: string;
    items: { item_type: string; equipment_id?: string; stock_item_id?: string; quantity: number; notes?: string }[];
  }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const reqResult = await client.query(
        `INSERT INTO user_requests (user_id, type, purpose) VALUES ($1, $2, $3) RETURNING *`,
        [data.user_id, data.type, data.purpose],
      );
      const requestId = reqResult.rows[0].id;
      for (const item of data.items) {
        await client.query(
          `INSERT INTO user_request_items (request_id, item_type, equipment_id, stock_item_id, quantity, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [requestId, item.item_type, item.equipment_id || null, item.stock_item_id || null, item.quantity, item.notes || null],
        );
      }
      await client.query('COMMIT');
      return this.snakeToCamel(reqResult.rows[0]);
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  }

  async approveUserRequest(id: string, approvedBy: string) {
    const result = await this.pool.query(
      `UPDATE user_requests SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, approvedBy],
    );
    return this.snakeToCamel(result.rows[0]);
  }

  async rejectUserRequest(id: string, reason: string) {
    const result = await this.pool.query(
      `UPDATE user_requests SET status = 'rejected', rejected_reason = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, reason],
    );
    return this.snakeToCamel(result.rows[0]);
  }

  async fulfillUserRequest(id: string, fulfilledBy: string, fulfillments: {
    item_id: string;
    unit_ids?: string[];      // equipment: serial unit IDs assigned
    fulfilled_quantity?: number; // supply: qty deducted
  }[]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const f of fulfillments) {
        const itemRow = await client.query(`SELECT * FROM user_request_items WHERE id = $1`, [f.item_id]);
        if (!itemRow.rows[0]) continue;
        const item = itemRow.rows[0];

        if (item.item_type === 'equipment' && f.unit_ids?.length) {
          // Create a booking for each assigned unit
          const reqRow = await client.query(`SELECT * FROM user_requests WHERE id = $1`, [id]);
          const req = reqRow.rows[0];
          const bookingResult = await client.query(
            `INSERT INTO bookings (equipment_id, user_id, quantity, start_date, end_date, purpose, status, approved_by, approved_at, booking_source)
             VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '30 days', $4, 'active', $5, NOW(), 'user_request')
             RETURNING id`,
            [item.equipment_id, req.user_id, f.unit_ids.length, req.purpose, fulfilledBy],
          );
          await client.query(
            `UPDATE user_request_items SET booking_id = $1, fulfilled_quantity = $2 WHERE id = $3`,
            [bookingResult.rows[0].id, f.unit_ids.length, f.item_id],
          );
          // Update unit statuses to 'booked'
          for (const uid of f.unit_ids) {
            await client.query(`UPDATE equipment_units SET status = 'booked' WHERE id = $1`, [uid]);
          }
          // Sync equipment available_quantity
          await client.query(
            `UPDATE equipment SET available_quantity = (SELECT COUNT(*) FROM equipment_units WHERE equipment_id = $1 AND status = 'available') WHERE id = $1`,
            [item.equipment_id],
          );
        } else if (item.item_type === 'supply' && f.fulfilled_quantity) {
          // Create requisition and deduct stock
          const reqRow = await client.query(`SELECT * FROM user_requests WHERE id = $1`, [id]);
          const req = reqRow.rows[0];
          const reqnResult = await client.query(
            `INSERT INTO requisitions (stock_item_id, user_id, quantity, purpose, status, approved_by, approved_at)
             VALUES ($1, $2, $3, $4, 'approved', $5, NOW())
             RETURNING id`,
            [item.stock_item_id, req.user_id, f.fulfilled_quantity, req.purpose, fulfilledBy],
          );
          await client.query(
            `UPDATE stock_items SET quantity = GREATEST(0, quantity - $1) WHERE id = $2`,
            [f.fulfilled_quantity, item.stock_item_id],
          );
          await client.query(
            `UPDATE user_request_items SET requisition_id = $1, fulfilled_quantity = $2 WHERE id = $3`,
            [reqnResult.rows[0].id, f.fulfilled_quantity, f.item_id],
          );
        }
      }

      await client.query(
        `UPDATE user_requests SET status = 'fulfilled', fulfilled_by = $2, fulfilled_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [id, fulfilledBy],
      );
      await client.query('COMMIT');
      return { message: 'Fulfilled' };
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  }
}

const defaultPermissions: Record<string, string[]> = {
  admin: [
    '/','/equipment','/inventory/stock',
    '/request/equipment','/request/supplies','/request/cart-equipment','/request/cart-supplies',
    '/bookings/approve-requests','/bookings/fulfill',
    '/bookings/book','/bookings/cart','/bookings/approve','/bookings/all','/bookings/returns','/bookings/inspection',
    '/inventory/requisitions','/inventory/approve','/inventory/history',
    '/maintenance/request','/maintenance/work-orders','/maintenance/pm-schedule',
    '/users/manage','/settings/permissions','/settings',
  ],
  executive: [
    '/','/equipment','/inventory/stock',
    '/bookings/approve-requests','/bookings/fulfill',
    '/bookings/book','/bookings/cart','/bookings/approve','/bookings/all','/bookings/returns','/bookings/inspection',
    '/inventory/requisitions','/inventory/approve','/inventory/history',
    '/maintenance/request','/maintenance/work-orders','/maintenance/pm-schedule',
    '/users/manage','/settings/permissions','/settings',
  ],
  dept_head: [
    '/','/equipment','/inventory/stock',
    '/bookings/approve-requests','/bookings/fulfill',
    '/bookings/book','/bookings/cart','/bookings/approve','/bookings/all','/bookings/returns','/bookings/inspection',
    '/inventory/requisitions','/inventory/approve','/inventory/history',
    '/maintenance/request','/maintenance/work-orders','/maintenance/pm-schedule',
  ],
  user: [
    '/request/equipment','/request/supplies',
    '/bookings/returns',
  ],
};
