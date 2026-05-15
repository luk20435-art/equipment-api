import { Module } from '@nestjs/common';
import { DataController } from './data.controller';
import { DataService } from './data.service';
import { HealthController } from './health.controller';

@Module({
  controllers: [DataController, HealthController],
  providers: [DataService],
})
export class DataModule {}
