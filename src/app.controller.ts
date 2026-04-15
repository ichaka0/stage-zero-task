import { Controller, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('api')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('classify')
  async classifyName(@Query('name') name: any) {
  
    if (name === undefined || name === null || name === '') {
      throw new HttpException(
        { status: 'error', message: 'Missing or empty name parameter' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (typeof name !== 'string' || Array.isArray(name)) {
      throw new HttpException(
        { status: 'error', message: 'name is not a string' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return this.appService.classifyName(name);
  }
}