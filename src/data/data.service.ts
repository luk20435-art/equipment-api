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

  async getUserRequestsTableHealth() {
    const result = await this.pool.query(
      `SELECT
         to_regclass('public.user_requests')      AS user_requests,
         to_regclass('public.user_request_items') AS user_request_items`,
    );
    const row = result.rows[0] || {};
    const hasUserRequests = !!row.user_requests;
    const hasUserRequestItems = !!row.user_request_items;
    const ready = hasUserRequests && hasUserRequestItems;
    return {
      ready,
      tables: {
        user_requests: hasUserRequests,
        user_request_items: hasUserRequestItems,
      },
      message: ready
        ? 'user request tables are ready'
        : 'missing tables: run migration for user_requests and user_request_items',
    };
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

  async updateEquipmentUnit(id: string, data: { unit_code?: string; serial_number?: string; total_usage_hours?: number; notes?: string; status?: string; dimension?: string; weight?: number }) {
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

  private buildUserRequestsQuery(where: string, includeUnitIds: boolean) {
    const unitIdsField = includeUnitIds ? `, 'unit_ids', ri.unit_ids` : '';
    return `
      SELECT r.*,
        u.name AS user_name, u.email AS user_email, u.department AS user_department,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ri.id, 'item_type', ri.item_type,
              'quantity', ri.quantity, 'notes', ri.notes,
              'equipment_id', ri.equipment_id, 'stock_item_id', ri.stock_item_id,
              'equipment_name', eq.name, 'equipment_code', eq.code, 'equipment_image_url', eq.image_url,
              'stock_name', si.name, 'stock_code', si.code, 'stock_unit', si.unit, 'stock_image_url', si.image_url,
              'booking_id', ri.booking_id, 'requisition_id', ri.requisition_id,
              'fulfilled_quantity', ri.fulfilled_quantity${unitIdsField},
              'unit_details', (
                SELECT COALESCE(json_agg(json_build_object(
                  'id', eu.id, 'unit_code', eu.unit_code, 'serial_number', eu.serial_number, 'unit_no', eu.unit_no,
                  'dimension', eu.dimension, 'weight', eu.weight
                ) ORDER BY eu.unit_no), '[]')
                FROM equipment_units eu
                WHERE ri.unit_ids IS NOT NULL
                  AND eu.id::text = ANY(SELECT jsonb_array_elements_text(ri.unit_ids::jsonb))
              )
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
    `;
  }

  async getUserRequests(filters?: { status?: string; userId?: string; type?: string; id?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (filters?.id)     { conditions.push(`r.id = $${idx++}`);     params.push(filters.id); }
    if (filters?.status) { conditions.push(`r.status = $${idx++}`); params.push(filters.status); }
    if (filters?.userId) { conditions.push(`r.user_id = $${idx++}`); params.push(filters.userId); }
    if (filters?.type)   { conditions.push(`r.type = $${idx++}`);   params.push(filters.type); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    try {
      const rows = await this.pool.query(this.buildUserRequestsQuery(where, true), params);
      return this.snakeToCamel(rows.rows);
    } catch (err: any) {
      if (err?.code === '42P01') return [];
      if (err?.code === '42703') {
        // unit_ids column not yet migrated — fall back to query without it
        const rows = await this.pool.query(this.buildUserRequestsQuery(where, false), params);
        return this.snakeToCamel(rows.rows);
      }
      throw err;
    }
  }

  async createUserRequest(data: {
    user_id: string;
    type: string;
    purpose: string;
    project_name?: string;
    start_date?: string;
    end_date?: string;
    items: { item_type: string; equipment_id?: string; stock_item_id?: string; quantity: number; notes?: string }[];
  }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const reqResult = await client.query(
        `INSERT INTO user_requests (user_id, type, purpose, project_name, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [data.user_id, data.type, data.purpose, data.project_name || null, data.start_date || null, data.end_date || null],
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
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code === '42P01') {
        throw new Error('ยังไม่พร้อมใช้งาน: กรุณารัน migration ตาราง user_requests ก่อน');
      }
      throw err;
    }
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
    unit_ids?: string[];
    fulfilled_quantity?: number;
  }[], manifest?: {
    to?: string; doc_no?: string; date?: string; attn?: string; cc?: string;
    carrier?: string; truck?: string; on?: string; ref?: string; responsible?: string;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const f of fulfillments) {
        const itemRow = await client.query(`SELECT * FROM user_request_items WHERE id = $1`, [f.item_id]);
        if (!itemRow.rows[0]) continue;
        const item = itemRow.rows[0];

        if (item.item_type === 'equipment' && f.unit_ids?.length) {
          // Store unit assignments and reserve units — booking created after receipt confirmation
          await client.query(
            `UPDATE user_request_items SET unit_ids = $1, fulfilled_quantity = $2 WHERE id = $3`,
            [JSON.stringify(f.unit_ids), f.unit_ids.length, f.item_id],
          );
          for (const uid of f.unit_ids) {
            await client.query(`UPDATE equipment_units SET status = 'reserved' WHERE id = $1`, [uid]);
          }
          await client.query(
            `UPDATE equipment SET available_quantity = (SELECT COUNT(*) FROM equipment_units WHERE equipment_id = $1 AND status = 'available') WHERE id = $1`,
            [item.equipment_id],
          );
        } else if (item.item_type === 'supply' && f.fulfilled_quantity) {
          // Deduct stock and create requisition (header + item row) for consumable supplies
          const reqRow = await client.query(`SELECT * FROM user_requests WHERE id = $1`, [id]);
          const req = reqRow.rows[0];
          const reqnResult = await client.query(
            `INSERT INTO requisitions (user_id, status, notes)
             VALUES ($1, 'approved', $2)
             RETURNING id`,
            [req.user_id, req.purpose || null],
          );
          const reqnId = reqnResult.rows[0].id;
          await client.query(
            `INSERT INTO requisition_items (requisition_id, stock_item_id, quantity)
             VALUES ($1, $2, $3)`,
            [reqnId, item.stock_item_id, f.fulfilled_quantity],
          );
          await client.query(
            `UPDATE stock_items SET quantity = GREATEST(0, quantity - $1) WHERE id = $2`,
            [f.fulfilled_quantity, item.stock_item_id],
          );
          await client.query(
            `UPDATE user_request_items SET requisition_id = $1, fulfilled_quantity = $2 WHERE id = $3`,
            [reqnId, f.fulfilled_quantity, f.item_id],
          );
        }
      }

      await client.query(
        `UPDATE user_requests
         SET status = 'waiting_pickup', fulfilled_by = $2, fulfilled_at = NOW(), updated_at = NOW(),
             manifest_to = $3, manifest_doc_no = $4, manifest_date = $5, manifest_attn = $6, manifest_cc = $7,
             manifest_carrier = $8, manifest_truck = $9, manifest_on = $10, manifest_ref = $11,
             manifest_responsible = $12
         WHERE id = $1`,
        [id, fulfilledBy,
         manifest?.to || null, manifest?.doc_no || null, manifest?.date || null,
         manifest?.attn || null, manifest?.cc || null, manifest?.carrier || null,
         manifest?.truck || null, manifest?.on || null, manifest?.ref || null,
         manifest?.responsible || null],
      );
      await client.query('COMMIT');
      return { message: 'Prepared for pickup' };
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  }

  async receiveUserRequest(id: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const reqRow = await client.query(`SELECT * FROM user_requests WHERE id = $1`, [id]);
      if (!reqRow.rows[0]) throw new Error('Request not found');
      const req = reqRow.rows[0];

      const itemsRow = await client.query(`SELECT * FROM user_request_items WHERE request_id = $1`, [id]);
      for (const item of itemsRow.rows) {
        if (item.item_type === 'equipment' && item.unit_ids) {
          const unitIds: string[] = Array.isArray(item.unit_ids) ? item.unit_ids : JSON.parse(item.unit_ids);
          if (unitIds.length === 0) continue;
          const bookingResult = await client.query(
            `INSERT INTO bookings (equipment_id, user_id, quantity, start_date, end_date, purpose, status, approved_by, approved_at, booking_source)
             VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '30 days', $4, 'active', $5, NOW(), 'user_request')
             RETURNING id`,
            [item.equipment_id, req.user_id, unitIds.length, req.purpose, req.fulfilled_by],
          );
          await client.query(
            `UPDATE user_request_items SET booking_id = $1 WHERE id = $2`,
            [bookingResult.rows[0].id, item.id],
          );
          for (const uid of unitIds) {
            await client.query(`UPDATE equipment_units SET status = 'booked' WHERE id = $1`, [uid]);
          }
          await client.query(
            `UPDATE equipment SET available_quantity = (SELECT COUNT(*) FROM equipment_units WHERE equipment_id = $1 AND status = 'available') WHERE id = $1`,
            [item.equipment_id],
          );
        }
        // Supply items: already deducted at fulfill time, nothing more to do
      }

      // Supply → completed immediately; Equipment → in_use (user received, booking active)
      const newStatus = req.type === 'supply' ? 'completed' : 'in_use';
      await client.query(
        `UPDATE user_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
        [newStatus, id],
      );
      await client.query('COMMIT');
      return { message: 'Received' };
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  }

  async startReturnUserRequest(id: string, returnItems?: any[]) {
    const result = await this.pool.query(
      `UPDATE user_requests SET status = 'pending_return', return_notes = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, returnItems ? JSON.stringify(returnItems) : null],
    );
    return this.snakeToCamel(result.rows[0]);
  }

  async returnUserRequest(id: string) {
    const result = await this.pool.query(
      `UPDATE user_requests SET status = 'returning', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    return this.snakeToCamel(result.rows[0]);
  }

  async completeUserRequest(id: string, inspectionResults?: { unit_id?: string; equipment_id?: string; name?: string; condition: 'good' | 'damaged'; note?: string }[]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Complete all associated bookings
      await client.query(
        `UPDATE bookings SET status = 'completed', updated_at = NOW()
         WHERE id IN (SELECT booking_id FROM user_request_items WHERE request_id = $1 AND booking_id IS NOT NULL)`,
        [id],
      );

      // Free equipment units — good → available, damaged → maintenance
      const itemsResult = await client.query(
        `SELECT unit_ids, equipment_id FROM user_request_items
         WHERE request_id = $1 AND item_type = 'equipment' AND unit_ids IS NOT NULL`,
        [id],
      );
      const damagedEquipmentIds = new Set<string>();
      for (const item of itemsResult.rows) {
        const unitIds: string[] = Array.isArray(item.unit_ids) ? item.unit_ids : JSON.parse(item.unit_ids || '[]');
        for (const uid of unitIds) {
          const result = inspectionResults?.find((r) => r.unit_id === uid);
          const isDamaged = result?.condition === 'damaged';
          await client.query(
            `UPDATE equipment_units SET status = $1 WHERE id = $2`,
            [isDamaged ? 'maintenance' : 'available', uid],
          );
          if (isDamaged && item.equipment_id) damagedEquipmentIds.add(item.equipment_id);
        }
        if (item.equipment_id) {
          await client.query(
            `UPDATE equipment SET available_quantity = (SELECT COUNT(*) FROM equipment_units WHERE equipment_id = $1 AND status = 'available') WHERE id = $1`,
            [item.equipment_id],
          );
        }
      }

      // Auto-create maintenance records for damaged items
      const createdMaintenanceIds: string[] = [];
      if (inspectionResults) {
        for (const r of inspectionResults) {
          if (r.condition === 'damaged' && r.equipment_id) {
            const mResult = await client.query(
              `INSERT INTO maintenance (equipment_id, type, description, status, scheduled_date, created_at, updated_at)
               VALUES ($1, 'repair', $2, 'scheduled', NOW()::date, NOW(), NOW()) RETURNING id`,
              [r.equipment_id, r.note ? `${r.name || ''}: ${r.note}` : `ชำรุดจากการส่งคืน — ${r.name || ''}`],
            );
            createdMaintenanceIds.push(mResult.rows[0].id);
          }
        }
      }

      await client.query(
        `UPDATE user_requests SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [id],
      );
      await client.query('COMMIT');
      return { message: 'Completed', hasDamaged: createdMaintenanceIds.length > 0 };
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  }

  async getNextBackloadDocNo() {
    const result = await this.pool.query(
      `SELECT COALESCE(COUNT(*), 0) + 1 AS next_seq FROM user_requests WHERE backload_doc_no IS NOT NULL`,
    );
    const seq = parseInt(result.rows[0].next_seq, 10);
    const year = new Date().getFullYear();
    return {
      docNo: `EQ.BL/${year}-${String(seq).padStart(4, '0')}`,
      seq,
    };
  }

  async getNextManifestDocNo() {
    const result = await this.pool.query(
      `SELECT COALESCE(MAX(manifest_seq_no), 0) + 1 AS next_seq FROM user_requests`,
    );
    const seq: number = result.rows[0].next_seq;
    const year = new Date().getFullYear();
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(year);
    return {
      docNo: `EQ.${year}-${String(seq).padStart(4, '0')}`,
      ref: `ON/${String(seq).padStart(3, '0')}-${dd}/${mm}/${yyyy}`,
      seq,
    };
  }

  async updateManifest(id: string, fields: {
    manifest_to?: string; manifest_doc_no?: string; manifest_date?: string;
    manifest_attn?: string; manifest_cc?: string; manifest_carrier?: string;
    manifest_truck?: string; manifest_on?: string; manifest_ref?: string;
    manifest_responsible?: string;
    backload_doc_no?: string; backload_ref?: string;
  }) {
    // Backload-only update (only backload fields provided)
    if (fields.backload_doc_no !== undefined || fields.backload_ref !== undefined) {
      const result = await this.pool.query(
        `UPDATE user_requests SET
          backload_doc_no = COALESCE($2, backload_doc_no),
          backload_ref    = COALESCE($3, backload_ref),
          updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, fields.backload_doc_no ?? null, fields.backload_ref ?? null],
      );
      return this.snakeToCamel(result.rows[0]);
    }

    const result = await this.pool.query(
      `UPDATE user_requests SET
        manifest_to = $2, manifest_doc_no = $3, manifest_date = $4,
        manifest_attn = $5, manifest_cc = $6, manifest_carrier = $7,
        manifest_truck = $8, manifest_on = $9, manifest_ref = $10,
        manifest_responsible = $11,
        manifest_rev_no = COALESCE(manifest_rev_no, 0) + 1,
        manifest_seq_no = CASE WHEN manifest_seq_no IS NULL
          THEN (SELECT COALESCE(MAX(manifest_seq_no), 0) + 1 FROM user_requests)
          ELSE manifest_seq_no END,
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id,
       fields.manifest_to ?? null, fields.manifest_doc_no ?? null, fields.manifest_date ?? null,
       fields.manifest_attn ?? null, fields.manifest_cc ?? null, fields.manifest_carrier ?? null,
       fields.manifest_truck ?? null, fields.manifest_on ?? null, fields.manifest_ref ?? null,
       fields.manifest_responsible ?? null],
    );
    return this.snakeToCamel(result.rows[0]);
  }

  // ============================================================
  // Inventory / Equipment Status
  // ============================================================

  async getEquipmentInventory(equipmentId?: string) {
    const conditions = equipmentId ? 'WHERE eq.id = $1' : '';
    const params = equipmentId ? [equipmentId] : [];

    const fullSql = `
      SELECT
        eq.id            AS equipment_id,
        eq.category,
        eq.code          AS equipment_code,
        eq.name          AS equipment_name,
        eq.trade_name,
        eq.dimensions,
        eu.id            AS unit_id,
        eu.unit_no,
        eu.unit_code,
        eu.serial_number,
        eu.total_usage_hours,
        eu.dimension,
        eu.weight,
        eu.status        AS unit_status,
        req.manifest_ref,
        req.manifest_doc_no,
        req.manifest_on,
        req.manifest_to,
        req.manifest_date,
        req.project_name,
        req.start_date,
        req.end_date,
        req.purpose,
        req.fulfilled_quantity,
        req.request_status,
        req.updated_at   AS request_updated_at
      FROM equipment eq
      JOIN equipment_units eu ON eu.equipment_id = eq.id
      LEFT JOIN LATERAL (
        SELECT
          ri.fulfilled_quantity,
          ur.manifest_ref, ur.manifest_doc_no, ur.manifest_on,
          ur.manifest_to, ur.manifest_date, ur.project_name,
          ur.start_date, ur.end_date, ur.purpose,
          ur.status AS request_status,
          ur.updated_at
        FROM user_request_items ri
        JOIN user_requests ur ON ur.id = ri.request_id
        WHERE ri.unit_ids IS NOT NULL
          AND eu.id::text = ANY(
            SELECT jsonb_array_elements_text(ri.unit_ids::jsonb)
          )
          AND ur.status NOT IN ('pending', 'rejected')
        ORDER BY ur.created_at DESC
        LIMIT 1
      ) req ON true
      ${conditions}
      ORDER BY eq.category, eq.code, eu.unit_no NULLS LAST
    `;

    try {
      const result = await this.pool.query(fullSql, params);
      return this.snakeToCamel(result.rows);
    } catch {
      // Fallback: skip optional columns that may not exist in older local schemas
      try {
        const result = await this.pool.query(`
          SELECT
            eq.id AS equipment_id, eq.category,
            eq.code AS equipment_code, eq.name AS equipment_name,
            NULL AS trade_name, eq.dimensions,
            eu.id AS unit_id, eu.unit_no, eu.unit_code, eu.serial_number,
            eu.total_usage_hours, eu.dimension, eu.weight,
            eu.status AS unit_status
          FROM equipment eq
          JOIN equipment_units eu ON eu.equipment_id = eq.id
          ${conditions}
          ORDER BY eq.category, eq.code, eu.unit_no NULLS LAST
        `, params);
        return this.snakeToCamel(result.rows);
      } catch {
        // Last resort: only guaranteed columns
        const result = await this.pool.query(`
          SELECT
            eq.id AS equipment_id, eq.category,
            eq.code AS equipment_code, eq.name AS equipment_name,
            NULL AS trade_name, NULL AS dimensions,
            eu.id AS unit_id, eu.unit_no, eu.unit_code, eu.serial_number,
            eu.total_usage_hours, NULL AS dimension, NULL AS weight,
            eu.status AS unit_status
          FROM equipment eq
          JOIN equipment_units eu ON eu.equipment_id = eq.id
          ${conditions}
          ORDER BY eq.category, eq.code, eu.unit_no NULLS LAST
        `, params);
        return this.snakeToCamel(result.rows);
      }
    }
  }
}

const defaultPermissions: Record<string, string[]> = {
  admin: [
    '/','/equipment','/inventory/stock',
    '/request/equipment','/request/supplies','/request/status','/request/cart-equipment','/request/cart-supplies',
    '/bookings/approve-requests','/bookings/fulfill','/bookings/waiting-pickup','/bookings/return-inspection',
    '/bookings/book','/bookings/cart','/bookings/approve','/bookings/all','/bookings/returns','/bookings/inspection',
    '/inventory/requisitions','/inventory/approve','/inventory/history',
    '/maintenance/request','/maintenance/work-orders','/maintenance/pm-schedule',
    '/users/manage','/settings/permissions','/settings',
  ],
  executive: [
    '/','/equipment','/inventory/stock',
    '/bookings/approve-requests','/bookings/fulfill','/bookings/waiting-pickup','/bookings/return-inspection',
    '/bookings/book','/bookings/cart','/bookings/approve','/bookings/all','/bookings/returns','/bookings/inspection',
    '/inventory/requisitions','/inventory/approve','/inventory/history',
    '/maintenance/request','/maintenance/work-orders','/maintenance/pm-schedule',
    '/users/manage','/settings/permissions','/settings',
  ],
  dept_head: [
    '/','/equipment','/inventory/stock',
    '/request/equipment','/request/supplies','/request/status',
    '/bookings/approve-requests','/bookings/fulfill','/bookings/waiting-pickup','/bookings/return-inspection',
    '/bookings/book','/bookings/cart','/bookings/approve','/bookings/all','/bookings/returns','/bookings/inspection',
    '/inventory/requisitions','/inventory/approve','/inventory/history',
    '/maintenance/request','/maintenance/work-orders','/maintenance/pm-schedule',
  ],
  user: [
    '/request/equipment','/request/supplies','/request/status',
    '/bookings/returns',
  ],
};

