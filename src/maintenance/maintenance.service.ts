import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../common/db.service';

@Injectable()
export class MaintenanceService {
  constructor(private supabaseService: DbService) {}

  async findAll(filters?: any) {
    const result = await this.supabaseService.getMaintenance(filters);
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async create(data: any) {
    const maintenanceData = {
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await this.supabaseService.createMaintenance(maintenanceData);
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async update(id: string, data: any) {
    const result = await this.supabaseService.updateMaintenance(id, data);
    
    if (result.error) {
      throw new NotFoundException('Maintenance record not found');
    }

    return result.data;
  }

  async start(id: string) {
    return this.update(id, { status: 'in-progress' });
  }

  async complete(id: string, notes?: string, cost?: number) {
    const result = await this.supabaseService.completeMaintenance(id, notes, cost);
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async delete(id: string) {
    const result = await this.supabaseService.deleteMaintenance(id);
    if (result.error) throw new NotFoundException('Maintenance record not found');
    return { success: true };
  }
}
