import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequiresPage } from '../auth/require-page.decorator';
import { BookingsService } from './bookings.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  async findAll(
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('source') source?: string,
    @Query('userEmail') userEmail?: string,
  ) {
    return this.bookingsService.findAll(userId, { status, source }, userEmail);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }

  @Post()
  async create(@Body() data: any) {
    return this.bookingsService.create(data);
  }

  @RequiresPage('/bookings/approve-requests')
  @Post(':id/approve')
  async approve(@Param('id') id: string, @Body('approverId') approverId: string) {
    return this.bookingsService.approve(id, approverId);
  }

  @RequiresPage('/bookings/approve-requests')
  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body('reason') reason: string) {
    return this.bookingsService.reject(id, reason);
  }

  @Put(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.bookingsService.cancel(id);
  }
}
