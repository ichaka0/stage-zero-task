import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import * as fs from 'fs';
import * as path from 'path';
import { Profile } from 'src/profile/entities/profile.entity';


@Injectable()
export class SeederService {
  constructor(
    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,
  ) {}

  async seedData() {
    const filePath = path.join(__dirname, './seed_profiles.json');
    const rawData = fs.readFileSync(filePath, 'utf-8');
    const { profiles } = JSON.parse(rawData);

    const formattedProfiles = profiles.map(p => ({
      id: uuidv7(),
      ...p,
      created_at: new Date()
    }));

    // Upsert prevents duplicates by relying on the unique 'name' column
    await this.profileRepo.upsert(formattedProfiles, ['name']);
    return { status: 'success', message: 'Database seeded' };
  }
}