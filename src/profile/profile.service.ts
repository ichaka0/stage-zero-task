import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository, SelectQueryBuilder } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { uuidv7 } from 'uuidv7';
import { Profile } from './entities/profile.entity';
import { CreateProfileDto } from './dto/create-profile.dto';

@Injectable()
export class ProfileService {
  private readonly allowedSortFields = new Set(['age', 'created_at', 'gender_probability']);

  constructor(
    @InjectRepository(Profile)
    private profilesRepository: Repository<Profile>,
    private httpService: HttpService,
  ) { }

  async createProfile(dto: CreateProfileDto) {
    const formattedName = dto.name.trim().toLowerCase();

    // 1. Idempotency Check
    const existingProfile = await this.profilesRepository.findOne({
      where: { name: ILike(formattedName) },
    });

    if (existingProfile) {
      return {
        isNew: false,
        profile: existingProfile,
      };
    }

    // 2. Fetch from External APIs concurrently
    const [genderData, ageData, countryData] = await Promise.all([
      this.fetchFromApi('Genderize', `https://api.genderize.io?name=${encodeURIComponent(formattedName)}`),
      this.fetchFromApi('Agify', `https://api.agify.io?name=${encodeURIComponent(formattedName)}`),
      this.fetchFromApi('Nationalize', `https://api.nationalize.io?name=${encodeURIComponent(formattedName)}`),
    ]);

    // 3. Edge Case Validations
    if (genderData.gender === null || genderData.count === 0) {
      this.throwExternalApiError('Genderize');
    }
    if (ageData.age === null) {
      this.throwExternalApiError('Agify');
    }
    if (!countryData.country || countryData.country.length === 0) {
      this.throwExternalApiError('Nationalize');
    }

    // 4. Classification Rules
    const age = ageData.age;
    let age_group = '';
    if (age <= 12) age_group = 'child';
    else if (age <= 19) age_group = 'teenager';
    else if (age <= 59) age_group = 'adult';
    else age_group = 'senior';

    // Pick highest probability country
    const highestProbCountry = countryData.country.sort((a, b) => b.probability - a.probability)[0];

    // 5. Construct and Save Entity
    const newProfile = this.profilesRepository.create({
      id: uuidv7(),
      name: formattedName,
      gender: genderData.gender,
      gender_probability: genderData.probability,
      sample_size: genderData.count,
      age: age,
      age_group: age_group,
      country_id: highestProbCountry.country_id,
      country_probability: highestProbCountry.probability,
      created_at: new Date(),
    });

    await this.profilesRepository.save(newProfile);

    return {
      isNew: true,
      profile: newProfile,
    };
  }

  async getProfile(id: string) {
    if (!this.isUuid(id)) {
      throw new HttpException({ status: 'error', message: 'Profile not found' }, HttpStatus.NOT_FOUND);
    }

    const profile = await this.profilesRepository.findOne({ where: { id } });
    if (!profile) {
      throw new HttpException({ status: 'error', message: 'Profile not found' }, HttpStatus.NOT_FOUND);
    }
    return profile;
  }

  async getAllProfiles(query: { gender?: string; country_id?: string; age_group?: string }) {
    const whereClause: any = {};

    if (query.gender) whereClause.gender = ILike(query.gender);
    if (query.country_id) whereClause.country_id = ILike(query.country_id);
    if (query.age_group) whereClause.age_group = ILike(query.age_group);

    const [profiles, count] = await this.profilesRepository.findAndCount({
      where: whereClause,
      select: ['id', 'name', 'gender', 'age', 'age_group', 'country_id'], // Restrict columns for GET all
    });

    return { count, profiles };
  }

  async deleteProfile(id: string) {
    const result = await this.profilesRepository.delete(id);
    if (result.affected === 0) {
      throw new HttpException({ status: 'error', message: 'Profile not found' }, HttpStatus.NOT_FOUND);
    }
  }

  async getFilteredProfiles(query: any) {
    const page = this.parsePositiveInteger(query.page, 1);
    const limit = Math.min(this.parsePositiveInteger(query.limit, 10), 50);
    const qb = this.profilesRepository.createQueryBuilder('profile');

    this.applyFilters(qb, query);

    const sortBy = this.parseSortField(query.sort_by);
    const sortOrder = this.parseSortOrder(query.order);
    qb.orderBy(`profile.${sortBy}`, sortOrder).addOrderBy('profile.id', 'ASC');

    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const nextPage = page < totalPages ? page + 1 : null;
    const previousPage = page > 1 && totalPages > 0 ? page - 1 : null;

    return {
      status: 'success',
      data,
      page,
      limit,
      total,
    };
  }

  // --- Helper Methods ---

  private async fetchFromApi(apiName: string, url: string) {
    try {
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data;
    } catch (error) {
      this.throwExternalApiError(apiName);
    }
  }

  private throwExternalApiError(apiName: string) {
    throw new HttpException(
      { status: 'error', message: `${apiName} returned an invalid response` },
      HttpStatus.BAD_GATEWAY,
    );
  }

  parseNaturalLanguage(q: any) {
    if (!q || typeof q !== 'string' || q.trim() === '') {
      throw new HttpException({ status: 'error', message: 'Unable to interpret query' }, HttpStatus.BAD_REQUEST);
    }

    const queryStr = q.toLowerCase();
    const filters: any = {};
    let interpreted = false;

    const hasMale = /\b(male|males|men|boy|boys)\b/.test(queryStr);
    const hasFemale = /\b(female|females|women|girl|girls)\b/.test(queryStr);

    if (hasMale && !hasFemale) {
      filters.gender = 'male';
      interpreted = true;
    } else if (hasFemale && !hasMale) {
      filters.gender = 'female';
      interpreted = true;
    } else if (hasMale && hasFemale) {
      interpreted = true;
    }

    // 1. Fix "young" range: 16–24 per spec (not 13–25)
    if (/\byoung\b/.test(queryStr)) {
      filters.min_age = 16;
      filters.max_age = 24;
      interpreted = true;
    }

    // 2. Fix teenager — also set age_group
    if (/\b(teenager|teenagers|teens)\b/.test(queryStr)) {
      filters.age_group = 'teenager';
      filters.min_age = 13;
      filters.max_age = 19;
      interpreted = true;
    }

    // 3. Fix adult — also set age_group
    if (/\b(adult|adults)\b/.test(queryStr)) {
      filters.age_group = 'adult';
      filters.min_age = 18;
      filters.max_age = 59;
      interpreted = true;
    }

    // 4. Fix child — also set age_group
    if (/\b(child|children|kid|kids)\b/.test(queryStr)) {
      filters.age_group = 'child';
      filters.max_age = 12;
      interpreted = true;
    }

    // 5. Fix senior — also set age_group
    if (/\b(senior|seniors|elderly)\b/.test(queryStr)) {
      filters.age_group = 'senior';
      filters.min_age = 60;
      interpreted = true;
    }

    // 6. Fix "above X" — spec shows "above 30" → min_age=30, NOT 31
    const aboveMatch = queryStr.match(/\b(?:above|over|older than) (\d+)\b/);
    if (aboveMatch) {
      filters.min_age = parseInt(aboveMatch[1], 10); // removed the +1
      interpreted = true;
    }
    const underMatch = queryStr.match(/\b(?:under|below|younger than) (\d+)\b/);
    if (underMatch) {
      filters.max_age = parseInt(underMatch[1], 10) - 1;
      interpreted = true;
    }

    const countryMap: Record<string, string> = {
      nigeria: 'NG',
      kenya: 'KE',
      angola: 'AO',
      tanzania: 'TZ',
      uganda: 'UG',
      sudan: 'SD',
    };

    for (const [country, code] of Object.entries(countryMap)) {
      if (
        queryStr.includes(`from ${country}`) ||
        queryStr.includes(`in ${country}`) ||
        queryStr.includes(country)
      ) {
        filters.country_id = code;
        interpreted = true;
        break;
      }
    }

    if (
      filters.min_age !== undefined &&
      filters.max_age !== undefined &&
      filters.min_age > filters.max_age
    ) {
      throw new HttpException({ status: 'error', message: 'Unable to interpret query' }, HttpStatus.BAD_REQUEST);
    }

    if (!interpreted) {
      throw new HttpException({ status: 'error', message: 'Unable to interpret query' }, HttpStatus.BAD_REQUEST);
    }

    return filters;
  }

  private applyFilters(qb: SelectQueryBuilder<Profile>, query: any) {
    if (query.gender) {
      qb.andWhere('LOWER(profile.gender) = :gender', { gender: String(query.gender).toLowerCase() });
    }

    if (query.age_group) {
      qb.andWhere('LOWER(profile.age_group) = :age_group', {
        age_group: String(query.age_group).toLowerCase(),
      });
    }

    if (query.country_id) {
      qb.andWhere('UPPER(profile.country_id) = :country_id', {
        country_id: String(query.country_id).toUpperCase(),
      });
    }

    const minAge = this.parseOptionalNumber(query.min_age);
    const maxAge = this.parseOptionalNumber(query.max_age);
    const minGenderProbability = this.parseOptionalNumber(query.min_gender_probability);
    const minCountryProbability = this.parseOptionalNumber(query.min_country_probability);

    if (minAge !== undefined) {
      qb.andWhere('profile.age >= :min_age', { min_age: minAge });
    }

    if (maxAge !== undefined) {
      qb.andWhere('profile.age <= :max_age', { max_age: maxAge });
    }

    if (minGenderProbability !== undefined) {
      qb.andWhere('profile.gender_probability >= :min_gender_probability', {
        min_gender_probability: minGenderProbability,
      });
    }

    if (minCountryProbability !== undefined) {
      qb.andWhere('profile.country_probability >= :min_country_probability', {
        min_country_probability: minCountryProbability,
      });
    }

    if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
      throw new HttpException({ status: 'error', message: 'Invalid query parameters' }, HttpStatus.BAD_REQUEST);
    }
  }

  private parsePositiveInteger(value: unknown, fallback: number): number {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue) || parsedValue < 1) {
      return fallback;
    }

    return Math.floor(parsedValue);
  }

  private parseOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      throw new HttpException({ status: 'error', message: 'Invalid query parameters' }, HttpStatus.BAD_REQUEST);
    }

    return parsedValue;
  }

  private parseSortField(value: unknown): string {
    if (value === undefined || value === null || value === '') {
      return 'created_at';
    }

    const sortField = String(value);
    if (!this.allowedSortFields.has(sortField)) {
      throw new HttpException({ status: 'error', message: 'Invalid query parameters' }, HttpStatus.BAD_REQUEST);
    }

    return sortField;
  }

  private parseSortOrder(value: unknown): 'ASC' | 'DESC' {
    if (value === undefined || value === null || value === '') {
      return 'ASC';
    }

    const sortOrder = String(value).toLowerCase();
    if (sortOrder !== 'asc' && sortOrder !== 'desc') {
      throw new HttpException({ status: 'error', message: 'Invalid query parameters' }, HttpStatus.BAD_REQUEST);
    }

    return sortOrder.toUpperCase() as 'ASC' | 'DESC';
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
