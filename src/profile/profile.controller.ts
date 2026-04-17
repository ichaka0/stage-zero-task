import { Controller, Post, Get, Delete, Body, Param, Query, Res, HttpStatus, HttpException } from '@nestjs/common';
import { Response } from 'express';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';


@Controller('profiles')
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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const profile = await this.profilesService.getProfile(id);
    return {
      status: 'success',
      data: profile,
    };
  }

  @Get()
  async findAll(@Query() query: any) {
    const result = await this.profilesService.getAllProfiles({
      gender: query.gender,
      country_id: query.country_id,
      age_group: query.age_group,
    });

    return {
      status: 'success',
      count: result.count,
      data: result.profiles,
    };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.profilesService.deleteProfile(id);
    return res.status(HttpStatus.NO_CONTENT).send();
  }
}