import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DbService } from '../common/db.service';

@Injectable()
export class BookingsService {
  constructor(private supabaseService: DbService) {}

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  async findAll(userId?: string, filters?: any, userEmail?: string) {
    let safeUserId = userId && this.isUuid(userId) ? userId : undefined;

    if (!safeUserId && userEmail) {
      const userResult = await this.supabaseService.getUserByEmail(userEmail);
      if (!userResult.error && userResult.data) {
        safeUserId = userResult.data.id;
      }
    }

    const result = await this.supabaseService.getBookings(safeUserId, filters);
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async findOne(id: string) {
    const result = await this.supabaseService.getBookingById(id);
    
    if (result.error) {
      throw new NotFoundException('Booking not found');
    }

    return result.data;
  }

  async create(data: any) {
    let userId = data.user_id;
    if (!this.isUuid(userId)) {
      if (!data.user_email) {
        throw new BadRequestException('Invalid user id and missing user email');
      }

      const user = await this.supabaseService.getUserByEmail(data.user_email);
      if (user.error || !user.data) {
        throw new BadRequestException('User not found for booking');
      }
      userId = user.data.id;
    }

    // Check equipment availability
    const equipment = await this.supabaseService.getEquipmentById(data.equipment_id);
    
    if (equipment.error || !equipment.data) {
      throw new NotFoundException('Equipment not found');
    }

    if (equipment.data.available_quantity < data.quantity) {
      throw new BadRequestException('Not enough equipment available');
    }

    // Create booking
    const { user_email, ...payload } = data;
    const bookingData = {
      ...payload,
      user_id: userId,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await this.supabaseService.createBooking(bookingData);
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    // Update equipment availability
    await this.supabaseService.updateEquipment(data.equipment_id, {
      available_quantity: equipment.data.available_quantity - data.quantity,
    });

    return result.data;
  }

  async approve(id: string, approverId: string) {
    const safeApproverId = this.isUuid(approverId) ? approverId : null;
    const result = await this.supabaseService.approveBooking(id, safeApproverId);

    if (result.error) {
      throw new NotFoundException(result.error.message || 'Booking not found');
    }

    return result.data;
  }

  async reject(id: string, reason: string) {
    // Get booking to return equipment
    const booking = await this.supabaseService.getBookingById(id);
    
    if (booking.error) {
      throw new NotFoundException('Booking not found');
    }

    const result = await this.supabaseService.rejectBooking(id, reason);
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    // Return equipment to available stock
    const equipment = await this.supabaseService.getEquipmentById(
      booking.data.equipment_id,
    );
    
    if (equipment.data) {
      await this.supabaseService.updateEquipment(booking.data.equipment_id, {
        available_quantity:
          equipment.data.available_quantity + booking.data.quantity,
      });
    }

    return result.data;
  }

  async cancel(id: string) {
    const booking = await this.supabaseService.getBookingById(id);
    
    if (booking.error) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.data.status !== 'pending') {
      throw new BadRequestException('Can only cancel pending bookings');
    }

    const result = await this.supabaseService.updateBooking(id, {
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    });

    // Return equipment
    const equipment = await this.supabaseService.getEquipmentById(
      booking.data.equipment_id,
    );
    
    if (equipment.data) {
      await this.supabaseService.updateEquipment(booking.data.equipment_id, {
        available_quantity:
          equipment.data.available_quantity + booking.data.quantity,
      });
    }

    return result.data;
  }
}
