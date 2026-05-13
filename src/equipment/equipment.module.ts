import { Module } from '@nestjs/common';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';
import { DbService } from '../common/db.service';

@Module({
  controllers: [EquipmentController],
  providers: [EquipmentService, DbService],
  exports: [EquipmentService],
})
export class EquipmentModule {}
