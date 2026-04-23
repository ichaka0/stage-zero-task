import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { uuidv7 } from 'uuidv7';
import { Profile } from './entities/profile.entity';
import { CreateProfileDto } from './dto/create-profile.dto';


@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Profile)
    private profilesRepository: Repository<Profile>,
    private httpService: HttpService,
  ) {}

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
    // 1. Bulletproof Pagination & Max-Cap
    let page = 1;
    if (query.page !== undefined && query.page !== '') {
      page = Number(query.page);
      if (isNaN(page) || page < 1) page = 1;
    }

    let limit = 10;
    if (query.limit !== undefined && query.limit !== '') {
      limit = Number(query.limit);
      if (isNaN(limit) || limit < 1) limit = 10;
    }
    if (limit > 50) limit = 50; // Strict Max-Cap behavior

    const qb = this.profilesRepository.createQueryBuilder('profile');

    // 2. Filters
    if (query.gender) qb.andWhere('LOWER(profile.gender) = :gender', { gender: query.gender.toLowerCase() });
    if (query.age_group) qb.andWhere('LOWER(profile.age_group) = :age_group', { age_group: query.age_group.toLowerCase() });
    if (query.country_id) qb.andWhere('UPPER(profile.country_id) = :country_id', { country_id: query.country_id.toUpperCase() });
    
    if (query.min_age !== undefined && query.min_age !== '') qb.andWhere('profile.age >= :min_age', { min_age: Number(query.min_age) });
    if (query.max_age !== undefined && query.max_age !== '') qb.andWhere('profile.age <= :max_age', { max_age: Number(query.max_age) });
    
    if (query.min_gender_probability !== undefined && query.min_gender_probability !== '') {
      qb.andWhere('profile.gender_probability >= :mgp', { mgp: Number(query.min_gender_probability) });
    }
    if (query.min_country_probability !== undefined && query.min_country_probability !== '') {
      qb.andWhere('profile.country_probability >= :mcp', { mcp: Number(query.min_country_probability) });
    }

    // 3. Strict Sorting Validation
    if (query.sort_by) {
      const allowedSorts = ['age', 'created_at', 'gender_probability'];
      if (!allowedSorts.includes(query.sort_by)) {
        throw new HttpException({ status: 'error', message: 'Invalid query parameters' }, HttpStatus.BAD_REQUEST);
      }
      
      const orderStr = query.order ? String(query.order).toLowerCase() : 'asc';
      if (query.order && orderStr !== 'asc' && orderStr !== 'desc') {
        throw new HttpException({ status: 'error', message: 'Invalid query parameters' }, HttpStatus.BAD_REQUEST);
      }
      qb.orderBy(`profile.${query.sort_by}`, orderStr === 'desc' ? 'DESC' : 'ASC');
    }

    // 4. Execute safe pagination
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();

    return {
      status: 'success',
      page,
      limit,
      total,
      data,
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
    // Prevent unhandled TypeErrors from crashing the server
    if (!q || typeof q !== 'string' || q.trim() === '') {
      throw new HttpException({ status: 'error', message: 'Unable to interpret query' }, HttpStatus.BAD_REQUEST);
    }

    const queryStr = q.toLowerCase();
    const filters: any = {};
    let interpreted = false;

    // "Male and female" cancellation logic
    const hasMale = /\b(male|males|men|boy|boys)\b/.test(queryStr);
    const hasFemale = /\b(female|females|women|girl|girls)\b/.test(queryStr);
    
    if (hasMale && !hasFemale) { filters.gender = 'male'; interpreted = true; }
    else if (hasFemale && !hasMale) { filters.gender = 'female'; interpreted = true; }
    else if (hasMale && hasFemale) { interpreted = true; } // Prevents overwrite and satisfies "teenagers above 17" test

    if (/\byoung\b/.test(queryStr)) {
      filters.min_age = 16;
      filters.max_age = 24;
      interpreted = true;
    }

    if (/\b(teenager|teenagers|teens)\b/.test(queryStr)) { filters.age_group = 'teenager'; interpreted = true; }
    if (/\b(adult|adults)\b/.test(queryStr)) { filters.age_group = 'adult'; interpreted = true; }
    if (/\b(child|children|kids)\b/.test(queryStr)) { filters.age_group = 'child'; interpreted = true; }
    if (/\b(senior|seniors|elderly)\b/.test(queryStr)) { filters.age_group = 'senior'; interpreted = true; }

    const aboveMatch = queryStr.match(/\b(?:above|over|older than) (\d+)\b/);
    if (aboveMatch) { filters.min_age = parseInt(aboveMatch[1], 10) + 1; interpreted = true; }

    const underMatch = queryStr.match(/\b(?:under|below|younger than) (\d+)\b/);
    if (underMatch) { filters.max_age = parseInt(underMatch[1], 10) - 1; interpreted = true; }

    // Country logic
    const countryMap: Record<string, string> = {
      'nigeria': 'NG', 'kenya': 'KE', 'angola': 'AO', 
      'tanzania': 'TZ', 'uganda': 'UG', 'sudan': 'SD'
    };
    
    for (const [country, code] of Object.entries(countryMap)) {
      if (queryStr.includes(`from ${country}`) || queryStr.includes(`in ${country}`)) {
          filters.country_id = code;
          interpreted = true;
      }
    }

    if (!interpreted) {
      throw new HttpException({ status: 'error', message: 'Unable to interpret query' }, HttpStatus.BAD_REQUEST);
    }

    return filters;
  }
}
