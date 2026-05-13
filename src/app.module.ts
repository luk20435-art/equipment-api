import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { EquipmentModule } from './equipment/equipment.module';
import { BookingsModule } from './bookings/bookings.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { DataModule } from './data/data.module';
import { DbService } from './common/db.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env', 
    }),
    AuthModule,
    EquipmentModule,
    BookingsModule,
    MaintenanceModule,
    DataModule,
  ],
  controllers: [],
  providers: [DbService],
})
export class AppModule {}
