import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { DbService } from '../common/db.service';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService, DbService],
  exports: [BookingsService],
})
export class BookingsModule {}
