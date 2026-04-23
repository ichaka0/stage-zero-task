import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';

@Controller('api/profiles')
export class ProfileController {
  constructor(private readonly profilesService: ProfileService) {}

  @Post()
  async create(@Body() dto: CreateProfileDto, @Res() res: Response) {
    if (dto.name === undefined || dto.name === null || dto.name === '') {
      throw new HttpException({ status: 'error', message: 'Missing or empty name' }, HttpStatus.BAD_REQUEST);
    }

    if (typeof dto.name !== 'string') {
      throw new HttpException({ status: 'error', message: 'Invalid type' }, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const result = await this.profilesService.createProfile(dto);

    if (result.isNew) {
      return res.status(HttpStatus.CREATED).json({
        status: 'success',
        data: result.profile,
      });
    } else {
      return res.status(HttpStatus.OK).json({
        status: 'success',
        message: 'Profile already exists',
        data: result.profile,
      });
    }
  }

  @Get()
  async findAll(@Query() query: any) {
    return this.profilesService.getFilteredProfiles(query);
  }

  @Get('filtered')
  async getAll(@Query() query: any) {
    return this.profilesService.getFilteredProfiles(query);
  }

  @Get('search')
  async searchByNLP(@Query() query: any) {
    if (!query.q) {
      throw new HttpException({ status: 'error', message: 'Missing or empty parameter' }, HttpStatus.BAD_REQUEST);
    }

    const parsedFilters = this.profilesService.parseNaturalLanguage(query.q);

    if (query.page !== undefined) parsedFilters.page = query.page;
    if (query.limit !== undefined) parsedFilters.limit = query.limit;
    if (query.sort_by !== undefined) parsedFilters.sort_by = query.sort_by;
    if (query.order !== undefined) parsedFilters.order = query.order;

    return this.profilesService.getFilteredProfiles(parsedFilters);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const profile = await this.profilesService.getProfile(id);
    return {
      status: 'success',
      data: profile,
    };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.profilesService.deleteProfile(id);
    return res.status(HttpStatus.NO_CONTENT).send();
  }
}
