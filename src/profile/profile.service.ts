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
}
