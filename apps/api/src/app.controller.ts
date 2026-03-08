import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller()
export class AppController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      env: process.env.NODE_ENV || 'development',
      apiUrl: process.env.API_URL || null,
      timestamp: new Date().toISOString(),
    };
  }
}
