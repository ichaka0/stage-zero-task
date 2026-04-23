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
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 10));
    
    const qb = this.profilesRepository.createQueryBuilder('profile');

    // Dynamic Filters
    if (query.gender) qb.andWhere('profile.gender = :gender', { gender: query.gender.toLowerCase() });
    if (query.age_group) qb.andWhere('profile.age_group = :age_group', { age_group: query.age_group.toLowerCase() });
    if (query.country_id) qb.andWhere('profile.country_id = :country_id', { country_id: query.country_id.toUpperCase() });
    
    if (query.min_age !== undefined) qb.andWhere('profile.age >= :min_age', { min_age: query.min_age });
    if (query.max_age !== undefined) qb.andWhere('profile.age <= :max_age', { max_age: query.max_age });
    
    if (query.min_gender_probability !== undefined) {
      qb.andWhere('profile.gender_probability >= :mgp', { mgp: query.min_gender_probability });
    }
    if (query.min_country_probability !== undefined) {
      qb.andWhere('profile.country_probability >= :mcp', { mcp: query.min_country_probability });
    }

    // Sorting
    const allowedSorts = ['age', 'created_at', 'gender_probability'];
    const sortBy = allowedSorts.includes(query.sort_by) ? query.sort_by : 'created_at';
    const order = query.order === 'asc' ? 'ASC' : 'DESC'; // Defaults to DESC

    qb.orderBy(`profile.${sortBy}`, order);

    // Pagination
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

parseNaturalLanguage(q: string) {
  if (!q || q.trim() === '') {
    throw new HttpException({ status: 'error', message: 'Unable to interpret query' }, HttpStatus.BAD_REQUEST);
  }

  const queryStr = q.toLowerCase();
  const filters: any = {};
  let interpreted = false;

  // 1. Gender parsing
  if (/\b(male|males|men|boy|boys)\b/.test(queryStr)) { filters.gender = 'male'; interpreted = true; }
  else if (/\b(female|females|women|girl|girls)\b/.test(queryStr)) { filters.gender = 'female'; interpreted = true; }

  // 2. Exact Age Modifiers ("young")
  if (/\byoung\b/.test(queryStr)) {
    filters.min_age = 16;
    filters.max_age = 24;
    interpreted = true;
  }

  // 3. Age Group Parsing
  if (/\b(teenager|teenagers|teens)\b/.test(queryStr)) { filters.age_group = 'teenager'; interpreted = true; }
  if (/\b(adult|adults)\b/.test(queryStr)) { filters.age_group = 'adult'; interpreted = true; }
  if (/\b(child|children|kids)\b/.test(queryStr)) { filters.age_group = 'child'; interpreted = true; }
  if (/\b(senior|seniors|elderly)\b/.test(queryStr)) { filters.age_group = 'senior'; interpreted = true; }

  // 4. Numeric Age Logic ("above 30", "under 18")
  const aboveMatch = queryStr.match(/\b(?:above|over|older than) (\d+)\b/);
  if (aboveMatch) { filters.min_age = parseInt(aboveMatch[1], 10) + 1; interpreted = true; } // "above 30" implies 31+

  const underMatch = queryStr.match(/\b(?:under|below|younger than) (\d+)\b/);
  if (underMatch) { filters.max_age = parseInt(underMatch[1], 10) - 1; interpreted = true; }

  // 5. Country Parsing ("from nigeria")
  // For a purely rule-based system without a massive DB join, a static map for the seed data is required.
  const countryMap = {
    'nigeria': 'NG', 'kenya': 'KE', 'angola': 'AO', 
    'tanzania': 'TZ', 'uganda': 'UG', 'sudan': 'SD'
    // Add additional ISO mappings based on your JSON seed
  };
  
  const fromMatch = queryStr.match(/\bfrom ([a-z]+)\b/);
  if (fromMatch && countryMap[fromMatch[1]]) {
    filters.country_id = countryMap[fromMatch[1]];
    interpreted = true;
  }

  if (!interpreted) {
    throw new HttpException({ status: 'error', message: 'Unable to interpret query' }, HttpStatus.BAD_REQUEST);
  }

  return filters;
}
}
