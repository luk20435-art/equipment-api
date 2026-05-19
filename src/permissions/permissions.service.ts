import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class PermissionsService {
  private pool: Pool;
  private cache: Record<string, string[]> | null = null;
  private cacheAt = 0;
  private readonly TTL = 60_000;

  constructor(private configService: ConfigService) {
    const url = process.env.DATABASE_URL;
    this.pool = url
      ? new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
      : new Pool({
          host: this.configService.get<string>('DB_HOST') || 'localhost',
          port: parseInt(this.configService.get<string>('DB_PORT') || '5432'),
          database: this.configService.get<string>('DB_NAME') || 'equipment_booking',
          user: this.configService.get<string>('DB_USER') || 'postgres',
          password: this.configService.get<string>('DB_PASSWORD'),
        });
  }

  async hasAccess(role: string, page: string): Promise<boolean> {
    if (role === 'admin') return true;
    const perms = await this.load();
    return (perms[role] ?? []).includes(page);
  }

  invalidate() {
    this.cache = null;
  }

  private async load(): Promise<Record<string, string[]>> {
    if (this.cache && Date.now() - this.cacheAt < this.TTL) return this.cache;
    try {
      const result = await this.pool.query(
        `SELECT value FROM settings WHERE key = 'role_permissions' LIMIT 1`,
      );
      this.cache = result.rows[0]?.value ?? {};
      this.cacheAt = Date.now();
    } catch {
      this.cache = this.cache ?? {};
    }
    return this.cache!;
  }
}
