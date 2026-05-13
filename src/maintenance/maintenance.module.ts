import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';
import { DbService } from '../common/db.service';

@Module({
  controllers: [MaintenanceController],
  providers: [MaintenanceService, DbService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
