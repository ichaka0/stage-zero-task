import { Test, TestingModule } from '@nestjs/testing';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

describe('ProfileController', () => {
  let controller: ProfileController;

  const mockProfileService = {
    getFilteredProfiles: jest.fn(),
    parseNaturalLanguage: jest.fn(),
    getProfile: jest.fn(),
    createProfile: jest.fn(),
    deleteProfile: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        {
          provide: ProfileService,
          useValue: mockProfileService,
        },
      ],
    }).compile();

    controller = module.get<ProfileController>(ProfileController);
  });

  it('delegates list queries to the filtered profile pipeline', async () => {
    const response = { status: 'success', data: [], pagination: { page: 1, limit: 10, total: 0, total_pages: 0 } };
    mockProfileService.getFilteredProfiles.mockResolvedValue(response);

    await expect(controller.findAll({ gender: 'female', page: '1' })).resolves.toBe(response);
    expect(mockProfileService.getFilteredProfiles).toHaveBeenCalledWith({ gender: 'female', page: '1' });
  });

  it('merges NLP parsing with pagination and sorting params', async () => {
    mockProfileService.parseNaturalLanguage.mockReturnValue({ gender: 'male', min_age: 18, max_age: 25 });
    mockProfileService.getFilteredProfiles.mockResolvedValue({ status: 'success', data: [] });

    await controller.searchByNLP({
      q: 'young males',
      page: '2',
      limit: '50',
      sort_by: 'age',
      order: 'desc',
    });

    expect(mockProfileService.parseNaturalLanguage).toHaveBeenCalledWith('young males');
    expect(mockProfileService.getFilteredProfiles).toHaveBeenCalledWith({
      gender: 'male',
      min_age: 18,
      max_age: 25,
      page: '2',
      limit: '50',
      sort_by: 'age',
      order: 'desc',
    });
  });
});
