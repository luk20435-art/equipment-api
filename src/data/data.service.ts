import { Injectable, BadRequestException } from '@nestjs/common';
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

    // Manifest extra columns
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS manifest_customer TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS manifest_project TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS manifest_department TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS manifest_no TEXT`).catch(() => {});
    // Backload extra columns
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS backload_no TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS backload_to TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS backload_attn TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS backload_cc TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS backload_date DATE`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS backload_carrier TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS backload_truck TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS backload_on TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS backload_responsible TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS backload_location TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS backload_project TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS backload_department TEXT`).catch(() => {});
    // Stock items — new columns
    this.pool.query(`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS brand TEXT`).catch(() => {});
    this.pool.query(`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS max_quantity INTEGER DEFAULT 0`).catch(() => {});
    this.pool.query(`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS document_url TEXT`).catch(() => {});
    // Equipment subcategories
    this.pool.query(`
      CREATE TABLE IF NOT EXISTS equipment_subcategories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});
    this.pool.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100)`).catch(() => {});
    // Equipment name templates
    this.pool.query(`
      CREATE TABLE IF NOT EXISTS equipment_name_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});
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
    const allowed = ['name','code','category','unit','quantity','min_quantity','max_quantity','location','description','image_url','brand','document_url'];
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
    const allowed = ['name','code','category','unit','quantity','min_quantity','max_quantity','location','description','image_url','brand','document_url'];
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
    const ref = await this.pool.query(
      `SELECT COUNT(*) FROM user_request_items WHERE stock_item_id = $1`,
      [id],
    );
    if (parseInt(ref.rows[0].count, 10) > 0) {
      throw new BadRequestException('ไม่สามารถลบได้ เนื่องจากมีการใช้งานในใบเบิกแล้ว');
    }
    return this.queryOne(`DELETE FROM stock_items WHERE id = $1 RETURNING *`, [id]);
  }

  // Stock addition history
  // Migration: CREATE TABLE IF NOT EXISTS stock_additions (
  //   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //   stock_item_id UUID NOT NULL, quantity_added INTEGER NOT NULL,
  //   note TEXT, added_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
  // );
  async addStockQuantity(id: string, quantity: number, note?: string, addedBy?: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE stock_items SET quantity = quantity + $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, quantity],
      );
      await client.query(
        `INSERT INTO stock_additions (stock_item_id, quantity_added, note, added_by) VALUES ($1, $2, $3, $4)`,
        [id, quantity, note ?? null, addedBy ?? null],
      ).catch(() => {}); // silently skip if table not yet migrated
      await client.query('COMMIT');
      return this.snakeToCamel(updated.rows[0]);
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  }

  async getStockHistory(id: string) {
    try {
      const result = await this.pool.query(
        `SELECT id, quantity_added, note, added_by, created_at FROM stock_additions WHERE stock_item_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [id],
      );
      return this.snakeToCamel(result.rows);
    } catch { return []; }
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

  // Equipment Name Templates
  async getEquipmentNameTemplates() {
    return this.query(`SELECT * FROM equipment_name_templates ORDER BY name ASC`);
  }

  async createEquipmentNameTemplate(name: string) {
    try {
      return await this.queryOne(
        `INSERT INTO equipment_name_templates (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *`,
        [name],
      );
    } catch (err: any) {
      throw new Error(err.message);
    }
  }

  async deleteEquipmentNameTemplate(id: string) {
    return this.queryOne(`DELETE FROM equipment_name_templates WHERE id = $1 RETURNING id`, [id]);
  }

  // Equipment Subcategories
  async getEquipmentSubcategories(category?: string) {
    if (category) {
      return this.query(
        `SELECT * FROM equipment_subcategories WHERE category = $1 ORDER BY name ASC`,
        [category],
      );
    }
    return this.query(`SELECT * FROM equipment_subcategories ORDER BY category ASC, name ASC`);
  }

  async createEquipmentSubcategory(data: { category: string; name: string }) {
    return this.queryOne(
      `INSERT INTO equipment_subcategories (category, name) VALUES ($1, $2) RETURNING *`,
      [data.category, data.name],
    );
  }

  async updateEquipmentSubcategory(id: string, data: { name?: string; category?: string }) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    return this.queryOne(
      `UPDATE equipment_subcategories SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id],
    );
  }

  async deleteEquipmentSubcategory(id: string) {
    return this.queryOne(
      `DELETE FROM equipment_subcategories WHERE id = $1 RETURNING id`,
      [id],
    );
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
    const [equipment, bookings, maintenance, stock, units] = await Promise.all([
      this.pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'available') AS available FROM equipment`),
      this.pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending, COUNT(*) FILTER (WHERE status = 'active') AS active FROM bookings`),
      this.pool.query(`SELECT COUNT(*) FILTER (WHERE status IN ('scheduled','in-progress')) AS active FROM maintenance_records`),
      this.pool.query(`SELECT COUNT(*) AS total FROM stock_items`).catch(() => ({ rows: [{ total: 0 }] })),
      this.pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'available')                              AS available,
          COUNT(*) FILTER (WHERE status IN ('in-use','reserved','booked'))          AS in_use,
          COUNT(*) FILTER (WHERE status = 'maintenance')                            AS maintenance,
          COUNT(*) FILTER (WHERE status IN ('broken','retired'))                    AS rejected,
          COUNT(*) FILTER (WHERE status NOT IN ('available','in-use','reserved','booked','maintenance','broken','retired')) AS others
        FROM equipment_units
      `).catch(() => ({ rows: [{ total: 0, available: 0, in_use: 0, maintenance: 0, rejected: 0, others: 0 }] })),
    ]);
    const u = units.rows[0];
    return {
      totalEquipment: parseInt(equipment.rows[0].total, 10),
      availableEquipment: parseInt(equipment.rows[0].available, 10),
      pendingBookings: parseInt(bookings.rows[0].pending, 10),
      activeBookings: parseInt(bookings.rows[0].active, 10),
      activeMaintenance: parseInt(maintenance.rows[0].active, 10),
      totalStockItems: parseInt(stock.rows[0].total, 10),
      units: {
        total:       parseInt(u.total, 10),
        available:   parseInt(u.available, 10),
        inUse:       parseInt(u.in_use, 10),
        maintenance: parseInt(u.maintenance, 10),
        rejected:    parseInt(u.rejected, 10),
        others:      parseInt(u.others, 10),
      },
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
              'equipment_name', eq.name, 'equipment_code', eq.code, 'equipment_image_url', eq.image_url, 'equipment_dimensions', eq.dimensions, 'equipment_weight', eq.weight,
              'stock_name', si.name, 'stock_code', si.code, 'stock_unit', si.unit, 'stock_image_url', si.image_url,
              'stock_category', si.category, 'stock_location', si.location,
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

  async cancelUserRequest(id: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const check = await client.query(
        `SELECT status, backload_doc_no FROM user_requests WHERE id = $1`, [id],
      );
      const status = check.rows[0]?.status;
      const backloadDocNo = check.rows[0]?.backload_doc_no;
      if (status === 'cancelled') throw new Error('รายการนี้ถูกยกเลิกไปแล้ว');
      if (status === 'completed') throw new Error('ไม่สามารถยกเลิกได้ เนื่องจากเสร็จสิ้นแล้ว');
      if (backloadDocNo) throw new Error('ไม่สามารถยกเลิกได้ เนื่องจากถูกส่งไปยัง Manifest Backload แล้ว');
      // Release all reserved/booked units back to available (unit_ids stored as JSONB)
      await client.query(
        `UPDATE equipment_units
         SET status = 'available', updated_at = NOW()
         WHERE id::text IN (
           SELECT jsonb_array_elements_text(unit_ids::jsonb)
           FROM user_request_items
           WHERE request_id = $1 AND unit_ids IS NOT NULL
         )`,
        [id],
      );
      // Update parent equipment available_quantity
      await client.query(
        `UPDATE equipment e
         SET available_quantity = (
           SELECT COUNT(*) FROM equipment_units WHERE equipment_id = e.id AND status = 'available'
         ), updated_at = NOW()
         WHERE e.id IN (
           SELECT DISTINCT equipment_id FROM user_request_items
           WHERE request_id = $1 AND equipment_id IS NOT NULL
         )`,
        [id],
      );
      // Mark request cancelled
      const result = await client.query(
        `UPDATE user_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id],
      );
      await client.query('COMMIT');
      return this.snakeToCamel(result.rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw new Error(err.message);
    } finally {
      client.release();
    }
  }

  async deleteUserRequest(id: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const check = await client.query(
        `SELECT status, backload_doc_no FROM user_requests WHERE id = $1`, [id],
      );
      if (!check.rows[0]) throw new Error('ไม่พบรายการ');
      const { status, backload_doc_no: backloadDocNo } = check.rows[0];
      if (backloadDocNo) throw new Error('ไม่สามารถลบได้ เนื่องจากถูกส่งไปยัง Manifest Backload แล้ว');
      // If not already cancelled, free units first
      if (status !== 'cancelled') {
        await client.query(
          `UPDATE equipment_units SET status = 'available', updated_at = NOW()
           WHERE id::text IN (
             SELECT jsonb_array_elements_text(unit_ids::jsonb)
             FROM user_request_items
             WHERE request_id = $1 AND unit_ids IS NOT NULL
           )`, [id],
        );
        await client.query(
          `UPDATE equipment e
           SET available_quantity = (
             SELECT COUNT(*) FROM equipment_units WHERE equipment_id = e.id AND status = 'available'
           ), updated_at = NOW()
           WHERE e.id IN (
             SELECT DISTINCT equipment_id FROM user_request_items
             WHERE request_id = $1 AND equipment_id IS NOT NULL
           )`, [id],
        );
      }
      await client.query(`DELETE FROM user_request_items WHERE request_id = $1`, [id]);
      await client.query(`DELETE FROM user_requests WHERE id = $1`, [id]);
      await client.query('COMMIT');
      return { success: true };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw new Error(err.message);
    } finally {
      client.release();
    }
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
    const year = new Date().getFullYear();
    const result = await this.pool.query(
      `SELECT COALESCE(MAX(CAST(SPLIT_PART(backload_doc_no, '-', 2) AS INTEGER)), 0) + 1 AS next_seq
       FROM user_requests
       WHERE backload_doc_no LIKE $1`,
      [`EQ.BL/${year}-%`],
    );
    const seq = parseInt(result.rows[0].next_seq, 10);
    return {
      docNo: `EQ.BL/${year}-${String(seq).padStart(4, '0')}`,
      seq,
    };
  }

  async assignBackloadDocNo(requestId: string) {
    const year = new Date().getFullYear();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Lock to prevent race condition, then assign only if not already set
      const result = await client.query(
        `UPDATE user_requests
         SET backload_doc_no = CONCAT(
           'EQ.BL/${year}-',
           LPAD(
             (SELECT COALESCE(MAX(CAST(SPLIT_PART(backload_doc_no, '-', 2) AS INTEGER)), 0) + 1
              FROM user_requests WHERE backload_doc_no LIKE 'EQ.BL/${year}-%')::text,
             4, '0'
           )
         )
         WHERE id = $1 AND (backload_doc_no IS NULL OR backload_doc_no = '')
         RETURNING backload_doc_no`,
        [requestId],
      );
      await client.query('COMMIT');
      // If already had a doc_no, fetch it
      if (result.rows.length === 0) {
        const existing = await this.pool.query(
          `SELECT backload_doc_no FROM user_requests WHERE id = $1`, [requestId],
        );
        return { docNo: existing.rows[0]?.backload_doc_no ?? null };
      }
      return { docNo: result.rows[0].backload_doc_no };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw new Error(err.message);
    } finally {
      client.release();
    }
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

  async createDirectManifest(data: {
    userId: string;
    manifestNo: string;
    customer: string; attn: string; cc: string; project: string;
    on: string; ref: string; docNo: string; date: string;
    carrier: string; truck: string; department: string; responsible: string;
    items: { equipmentId: string; units: { unitId: string; unitCode: string }[] }[];
  }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get next seq no
      const seqRes = await client.query(
        `SELECT COALESCE(MAX(manifest_seq_no), 0) + 1 AS next_seq FROM user_requests`,
      );
      const seqNo: number = seqRes.rows[0].next_seq;

      // Create user_request
      const reqRes = await client.query(
        `INSERT INTO user_requests
           (user_id, type, purpose, status, fulfilled_by, fulfilled_at,
            manifest_no, manifest_seq_no, manifest_customer, manifest_to,
            manifest_attn, manifest_cc, manifest_on, manifest_ref,
            manifest_doc_no, manifest_date, manifest_carrier, manifest_truck,
            manifest_department, manifest_responsible, manifest_project,
            created_at, updated_at)
         VALUES ($1,'equipment',$2,'waiting_pickup',$1,NOW(),
                 $3,$4,$5,$5,
                 $6,$7,$8,$9,
                 $10,$11::date,$12,$13,
                 $14,$15,$16,
                 NOW(),NOW())
         RETURNING *`,
        [
          data.userId, `Manifest ${data.manifestNo}`,
          data.manifestNo, seqNo, data.customer,
          data.attn, data.cc, data.on, data.ref,
          data.docNo, data.date || null, data.carrier, data.truck,
          data.department, data.responsible, data.project || null,
        ],
      );
      const requestId = reqRes.rows[0].id;

      // Create items + assign units
      for (const item of data.items) {
        const unitIds = item.units.map((u) => u.unitId);
        const itemRes = await client.query(
          `INSERT INTO user_request_items
             (request_id, item_type, equipment_id, quantity, unit_ids, fulfilled_quantity)
           VALUES ($1,'equipment',$2,$3,$4,$3) RETURNING id`,
          [requestId, item.equipmentId, unitIds.length, JSON.stringify(unitIds)],
        );
        const itemId = itemRes.rows[0].id;
        for (const uid of unitIds) {
          await client.query(
            `UPDATE equipment_units SET status='reserved', updated_at=NOW() WHERE id=$1`, [uid],
          );
        }
        if (item.equipmentId) {
          await client.query(
            `UPDATE equipment SET available_quantity=(SELECT COUNT(*) FROM equipment_units WHERE equipment_id=$1 AND status='available'), updated_at=NOW() WHERE id=$1`,
            [item.equipmentId],
          );
        }
        void itemId;
      }

      await client.query('COMMIT');
      return this.snakeToCamel(reqRes.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateManifest(id: string, fields: {
    manifest_to?: string; manifest_doc_no?: string; manifest_date?: string;
    manifest_attn?: string; manifest_cc?: string; manifest_carrier?: string;
    manifest_truck?: string; manifest_on?: string; manifest_ref?: string;
    manifest_responsible?: string; manifest_project?: string; manifest_department?: string;
    backload_doc_no?: string; backload_ref?: string;
  }) {
    // Backload-only update (only backload fields provided)
    if (fields.backload_doc_no !== undefined || fields.backload_ref !== undefined ||
        (fields as any).backload_no !== undefined) {
      const f = fields as any;
      const result = await this.pool.query(
        `UPDATE user_requests SET
          backload_doc_no      = COALESCE($2,  backload_doc_no),
          backload_ref         = COALESCE($3,  backload_ref),
          backload_no          = COALESCE($4,  backload_no),
          backload_to          = COALESCE($5,  backload_to),
          backload_attn        = COALESCE($6,  backload_attn),
          backload_cc          = COALESCE($7,  backload_cc),
          backload_date        = COALESCE($8,  backload_date),
          backload_carrier     = COALESCE($9,  backload_carrier),
          backload_truck       = COALESCE($10, backload_truck),
          backload_on          = COALESCE($11, backload_on),
          backload_responsible = COALESCE($12, backload_responsible),
          backload_location    = COALESCE($13, backload_location),
          backload_project     = COALESCE($14, backload_project),
          backload_department  = COALESCE($15, backload_department),
          updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id,
         fields.backload_doc_no ?? null, fields.backload_ref ?? null,
         f.backload_no ?? null, f.backload_to ?? null, f.backload_attn ?? null,
         f.backload_cc ?? null, f.backload_date ?? null, f.backload_carrier ?? null,
         f.backload_truck ?? null, f.backload_on ?? null, f.backload_responsible ?? null,
         f.backload_location ?? null, f.backload_project ?? null, f.backload_department ?? null],
      );
      return this.snakeToCamel(result.rows[0]);
    }

    const result = await this.pool.query(
      `UPDATE user_requests SET
        manifest_to = $2, manifest_doc_no = $3, manifest_date = $4,
        manifest_attn = $5, manifest_cc = $6, manifest_carrier = $7,
        manifest_truck = $8, manifest_on = $9, manifest_ref = $10,
        manifest_responsible = $11, manifest_project = $12, manifest_department = $13,
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
       fields.manifest_responsible ?? null, fields.manifest_project ?? null, fields.manifest_department ?? null],
    );
    return this.snakeToCamel(result.rows[0]);
  }

  // ============================================================
  // Dashboard KPI (user requests stats)
  // ============================================================

  async getMonthlyBookingStats() {
    try {
      const result = await this.pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'completed')        AS completed,
          COUNT(*) FILTER (WHERE status = 'rejected')         AS rejected
        FROM user_requests
        WHERE type = 'equipment'
          AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at)
      `);
      return result.rows.map(r => ({
        month:     r.month as string,
        total:     parseInt(r.total, 10),
        completed: parseInt(r.completed, 10),
        rejected:  parseInt(r.rejected, 10),
      }));
    } catch {
      return [];
    }
  }

  async getUserRequestStats() {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'in_use')                             AS in_use,
          COUNT(*) FILTER (WHERE status = 'in_use' AND end_date < NOW())         AS overdue,
          COUNT(*) FILTER (WHERE status IN ('pending_return', 'returning'))      AS pending_return,
          COUNT(*) FILTER (WHERE status = 'waiting_pickup')                     AS waiting_pickup,
          COUNT(*) FILTER (WHERE status = 'pending')                            AS pending_approval
        FROM user_requests
        WHERE type = 'equipment'
      `);
      const r = result.rows[0];
      return {
        inUse:           parseInt(r.in_use, 10),
        overdue:         parseInt(r.overdue, 10),
        pendingReturn:   parseInt(r.pending_return, 10),
        waitingPickup:   parseInt(r.waiting_pickup, 10),
        pendingApproval: parseInt(r.pending_approval, 10),
      };
    } catch {
      return { inUse: 0, overdue: 0, pendingReturn: 0, waitingPickup: 0, pendingApproval: 0 };
    }
  }

  // ============================================================
  // Unit History
  // ============================================================

  async getUnitHistory(unitCode: string) {
    try {
      const result = await this.pool.query(`
        SELECT DISTINCT
          ur.id, ur.status, ur.project_name, ur.start_date, ur.end_date,
          ur.manifest_to, ur.manifest_doc_no, ur.manifest_date, ur.manifest_ref,
          ur.backload_doc_no, ur.backload_ref, ur.purpose,
          ur.created_at, ur.updated_at,
          u.name AS user_name, u.department AS user_department,
          eu.unit_code, eu.serial_number,
          e.name AS equipment_name, e.category
        FROM user_requests ur
        JOIN user_request_items ri ON ri.request_id = ur.id
        JOIN equipment_units eu ON eu.id::text = ANY(
          SELECT jsonb_array_elements_text(ri.unit_ids::jsonb)
        )
        JOIN equipment e ON e.id = eu.equipment_id
        LEFT JOIN users u ON u.id = ur.user_id
        WHERE eu.unit_code = $1
          AND ri.unit_ids IS NOT NULL
          AND ur.status NOT IN ('pending', 'rejected')
        ORDER BY ur.created_at DESC
      `, [unitCode]);
      return this.snakeToCamel(result.rows);
    } catch {
      return [];
    }
  }

  // ============================================================
  // Bookings Calendar
  // ============================================================

  async getBookingsCalendar() {
    try {
      const result = await this.pool.query(`
        SELECT
          ur.id, ur.status, ur.project_name, ur.start_date, ur.end_date,
          ur.manifest_to, ur.purpose,
          STRING_AGG(DISTINCT e.name, ', ') AS equipment_names
        FROM user_requests ur
        JOIN user_request_items ri ON ri.request_id = ur.id AND ri.item_type = 'equipment'
        LEFT JOIN equipment e ON e.id = ri.equipment_id
        WHERE ur.type = 'equipment'
          AND ur.status NOT IN ('pending', 'rejected')
          AND ur.start_date IS NOT NULL
        GROUP BY ur.id
        ORDER BY ur.start_date
      `);
      return this.snakeToCamel(result.rows);
    } catch {
      return [];
    }
  }

  // ============================================================
  // Inspection Images (stored as base64 TEXT in PostgreSQL)
  // Migration: CREATE TABLE IF NOT EXISTS inspection_images (
  //   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //   request_id UUID NOT NULL, filename TEXT NOT NULL,
  //   mimetype VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
  //   data TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
  // );
  // ============================================================

  async saveInspectionImage(requestId: string, filename: string, mimetype: string, dataBase64: string) {
    const result = await this.pool.query(
      `INSERT INTO inspection_images (request_id, filename, mimetype, data)
       VALUES ($1, $2, $3, $4) RETURNING id, filename, mimetype, created_at`,
      [requestId, filename, mimetype, dataBase64],
    );
    return this.snakeToCamel(result.rows[0]);
  }

  async getInspectionImages(requestId: string) {
    try {
      const result = await this.pool.query(
        `SELECT id, request_id, filename, mimetype, data, created_at
         FROM inspection_images WHERE request_id = $1 ORDER BY created_at`,
        [requestId],
      );
      return this.snakeToCamel(result.rows);
    } catch {
      return [];
    }
  }

  async deleteInspectionImage(id: string) {
    await this.pool.query(`DELETE FROM inspection_images WHERE id = $1`, [id]);
    return { success: true };
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

