import { Test, TestingModule } from '@nestjs/testing';
import { LandController } from './lands.controller';
import { LandService } from './lands.service';

describe('LandsController', () => {
  let controller: LandController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LandController],
      providers: [LandService],
    }).compile();

    controller = module.get<LandController>(LandController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
