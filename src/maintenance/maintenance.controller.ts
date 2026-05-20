import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequiresPage } from '../auth/require-page.decorator';
import { MaintenanceService } from './maintenance.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  async findAll(@Query('status') status?: string) {
    return this.maintenanceService.findAll({ status });
  }

  @Post()
  async create(@Body() data: any) {
    return this.maintenanceService.create(data);
  }

  @RequiresPage('/maintenance/work-orders')
  @Put(':id')
  async update(@Param('id') id: string, @Body() data: any) {
    return this.maintenanceService.update(id, data);
  }

  @RequiresPage('/maintenance/work-orders')
  @Post(':id/start')
  async start(@Param('id') id: string) {
    return this.maintenanceService.start(id);
  }

  @RequiresPage('/maintenance/work-orders')
  @Post(':id/complete')
  async complete(
    @Param('id') id: string,
    @Body('notes') notes?: string,
    @Body('cost') cost?: number,
  ) {
    return this.maintenanceService.complete(id, notes, cost);
  }

  @RequiresPage('/maintenance/pm-schedule')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.maintenanceService.delete(id);
  }
}
