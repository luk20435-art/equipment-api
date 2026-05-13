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
import { EquipmentService } from './equipment.service';

@UseGuards(JwtAuthGuard)

@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.equipmentService.findAll({
      search,
      category,
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.equipmentService.findOne(id);
  }

  @Post()
  async create(@Body() data: any) {
    return this.equipmentService.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: any) {
    return this.equipmentService.update(id, data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.equipmentService.remove(id);
  }

  @Post('seed/init')
  async seedEquipment() {
    return this.equipmentService.seedEquipment();
  }
}
