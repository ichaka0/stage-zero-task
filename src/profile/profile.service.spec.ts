import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { Profile } from './entities/profile.entity';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let service: ProfileService;

  const mockQueryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  const mockRepository = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockHttpService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        {
          provide: getRepositoryToken(Profile),
          useValue: mockRepository,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
  });

  it('caps limit and returns a pagination envelope', async () => {
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[{ id: '1' }], 61]);

    const result = await service.getFilteredProfiles({ page: '2', limit: '100', sort_by: 'age' });

    expect(mockQueryBuilder.skip).toHaveBeenCalledWith(50);
    expect(mockQueryBuilder.take).toHaveBeenCalledWith(50);
    expect(result.meta).toEqual({
      page: 2,
      limit: 50,
      total: 61,
      pages: 2,
    });
  });

  it('rejects an invalid sort field', async () => {
    await expect(service.getFilteredProfiles({ sort_by: 'name' })).rejects.toMatchObject({
      response: { status: 'error', message: 'Invalid query parameters' },
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('parses an adult males from kenya query', () => {
    expect(service.parseNaturalLanguage('adult males from kenya')).toEqual({
      gender: 'male',
      min_age: 18,
      max_age: 59,
      country_id: 'KE',
    });
  });

  it('parses young males as a numeric age range', () => {
    expect(service.parseNaturalLanguage('young males')).toEqual({
      gender: 'male',
      min_age: 13,
      max_age: 25,
    });
  });

  it('parses male and female teenagers above 17 without adding a gender filter', () => {
    expect(service.parseNaturalLanguage('Male and female teenagers above 17')).toEqual({
      min_age: 18,
      max_age: 19,
    });
  });

  it('rejects an uninterpretable natural-language query', () => {
    expect(() => service.parseNaturalLanguage('zxqv unparseable term')).toThrow(HttpException);

    try {
      service.parseNaturalLanguage('zxqv unparseable term');
    } catch (error) {
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(httpError.getResponse()).toEqual({
        status: 'error',
        message: 'Unable to interpret query',
      });
    }
  });
});
