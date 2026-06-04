import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../common/db.service';

@Injectable()
export class EquipmentService {
  constructor(private supabaseService: DbService) {}

  async findAll(filters?: {
    search?: string;
    category?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const result = await this.supabaseService.getEquipment(filters);
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    return {
      data: result.data,
      total: result.count,
      page: filters?.page || 1,
      limit: filters?.limit || 20,
    };
  }

  async findOne(id: string) {
    const result = await this.supabaseService.getEquipmentById(id);
    
    if (result.error) {
      throw new NotFoundException('Equipment not found');
    }

    return result.data;
  }

  async create(data: any) {
    const result = await this.supabaseService.createEquipment(data);
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async update(id: string, data: any) {
    const result = await this.supabaseService.updateEquipment(id, data);
    
    if (result.error) {
      throw new NotFoundException('Equipment not found');
    }

    return result.data;
  }

  async remove(id: string) {
    const result = await this.supabaseService.deleteEquipment(id);
    if (result.error) {
      throw new NotFoundException(result.error.message);
    }
    return { message: 'Equipment deleted successfully' };
  }

  async seedEquipment() {
    const sampleEquipment = [
      {
        name: 'สว่านไฟฟ้า Bosch รุ่น 500',
        code: 'TOOL-0001',
        category: 'เครื่องมือไฟฟ้า',
        description: 'สว่านไฟฟ้าสำหรับงานหนัก',
        location: 'คลัง A-1',
        status: 'available',
        quantity: 5,
        available_quantity: 5,
        maintenance_interval_days: 90,
      },
      {
        name: 'เลื่อยวงเดือน Makita',
        code: 'TOOL-0002',
        category: 'เครื่องมือไฟฟ้า',
        description: 'เลื่อยวงเดือนสำหรับตัดไม้',
        location: 'คลัง A-2',
        status: 'available',
        quantity: 3,
        available_quantity: 3,
        maintenance_interval_days: 90,
      },
      {
        name: 'เครื่องเชื่อม MIG 200A',
        code: 'MACH-0001',
        category: 'เครื่องจักรกล',
        description: 'เครื่องเชื่อมไฟฟ้า 200 แอมป์',
        location: 'คลัง B-1',
        status: 'available',
        quantity: 2,
        available_quantity: 1,
        maintenance_interval_days: 60,
      },
      {
        name: 'มัลติมิเตอร์ดิจิตอล',
        code: 'MEAS-0001',
        category: 'อุปกรณ์วัดและทดสอบ',
        description: 'เครื่องวัดค่าไฟฟ้า',
        location: 'คลัง C-1',
        status: 'available',
        quantity: 10,
        available_quantity: 8,
        maintenance_interval_days: 180,
      },
    ];

    const results = [];
    for (const equipment of sampleEquipment) {
      try {
        const result = await this.supabaseService.createEquipment(equipment);
        if (!result.error) {
          results.push({
            success: true,
            code: equipment.code,
            message: `Created ${equipment.name}`,
          });
        } else {
          results.push({
            success: false,
            code: equipment.code,
            message: result.error.message,
          });
        }
      } catch (error: any) {
        results.push({
          success: false,
          code: equipment.code,
          message: error.message,
        });
      }
    }

    return {
      message: 'Seeding complete',
      results,
      total: sampleEquipment.length,
      successful: results.filter(r => r.success).length,
    };
  }
}
