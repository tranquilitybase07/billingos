import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Uncomment to test Sentry error capturing
  // @Get('debug-sentry')
  // getError(): string {
  //   throw new Error('My first Sentry error!');
  // }
}
