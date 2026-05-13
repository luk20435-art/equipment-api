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

  // Stock Items
  async getStockItems(filters?: { search?: string; category?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters?.search) {
      conditions.push(`(COALESCE(name, title) ILIKE $${idx} OR code ILIKE $${idx} OR category ILIKE $${idx})`);
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
      `SELECT *, COALESCE(name, title) AS name FROM stock_items ${where} ORDER BY COALESCE(name, title)`,
      params,
    );
  }

  async getStockItemById(id: string) {
    return this.queryOne(`SELECT *, COALESCE(name, title) AS name FROM stock_items WHERE id = $1`, [id]);
  }

  async createStockItem(data: any) {
    const allowed = ['name','code','category','unit','quantity','min_quantity','location','description','image_url','title'];
    const entries = Object.entries(data).filter(([k, v]) => allowed.includes(k) && v !== undefined);
    if (entries.length === 0) throw new Error('No valid fields provided');
    const keys = entries.map(([k]) => k);
    const values = entries.map(([, v]) => v);
    const cols = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    return this.queryOne(
      `INSERT INTO stock_items (${cols}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
  }

  async updateStockItem(id: string, data: any) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    return this.queryOne(
      `UPDATE stock_items SET ${sets} WHERE id = $${keys.length + 1} RETURNING *, COALESCE(name, title) AS name`,
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
    const sql = `
      SELECT eu.*, row_to_json(e.*) as equipment
      FROM equipment_units eu
      LEFT JOIN equipment e ON eu.equipment_id = e.id
      ${where}
      ORDER BY eu.unit_no
    `;
    return this.query(sql, params);
  }

  // Users
  async getUsers() {
    return this.query(`SELECT id, name, email, role, department, is_active, created_at FROM users ORDER BY name`);
  }

  async createUserAccount(data: { name: string; email: string; role: string; department?: string; password_hash: string }) {
    return this.queryOne(
      `INSERT INTO users (id, name, email, role, department, is_active, password_hash, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5, NOW(), NOW()) RETURNING id, name, email, role, department, is_active, created_at`,
      [data.name, data.email, data.role, data.department ?? null, data.password_hash],
    );
  }

  async updateUserAccount(id: string, data: { name?: string; role?: string; department?: string; is_active?: boolean }) {
    const keys = Object.keys(data).filter((k) => (data as any)[k] !== undefined);
    if (keys.length === 0) return this.queryOne(`SELECT id, name, email, role, department, is_active FROM users WHERE id = $1`, [id]);
    const values = keys.map((k) => (data as any)[k]);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    return this.queryOne(
      `UPDATE users SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING id, name, email, role, department, is_active`,
      [...values, id],
    );
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
}

const defaultPermissions: Record<string, string[]> = {
  admin: [
    '/','/equipment','/inventory/stock','/bookings/request','/bookings/approve-requests',
    '/bookings/book','/bookings/approve','/bookings/all','/bookings/returns','/bookings/inspection',
    '/inventory/requisitions','/inventory/approve','/inventory/history',
    '/maintenance/request','/maintenance/work-orders','/maintenance/pm-schedule',
    '/users/manage','/settings/permissions','/settings',
  ],
  manager: [
    '/','/equipment','/inventory/stock','/bookings/request','/bookings/approve-requests',
    '/bookings/book','/bookings/approve','/bookings/all','/bookings/returns','/bookings/inspection',
    '/inventory/requisitions','/inventory/approve','/inventory/history',
    '/maintenance/request','/maintenance/work-orders','/maintenance/pm-schedule','/settings',
  ],
  employee: [
    '/','/bookings/request','/bookings/book','/bookings/cart','/bookings/all','/bookings/returns',
    '/inventory/requisitions','/inventory/stock','/inventory/history','/settings',
  ],
  technician: [
    '/','/maintenance/request','/maintenance/work-orders','/maintenance/pm-schedule','/settings',
  ],
};
