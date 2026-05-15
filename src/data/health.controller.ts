import { Controller, Get } from '@nestjs/common';
import { DataService } from './data.service';

@Controller('health')
export class HealthController {
  constructor(private readonly dataService: DataService) {}

  @Get('user-requests-ready')
  async userRequestsReady() {
    return this.dataService.getUserRequestsTableHealth();
  }
}

