import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  const mockAppService = {
    classifyName: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('delegates valid classification requests to the service', async () => {
    const response = { status: 'success', data: { name: 'john' } };
    mockAppService.classifyName.mockResolvedValue(response);

    await expect(appController.classifyName('john')).resolves.toBe(response);
    expect(mockAppService.classifyName).toHaveBeenCalledWith('john');
  });
});
