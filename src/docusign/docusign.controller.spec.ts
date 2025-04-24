import { Test, TestingModule } from '@nestjs/testing';
import { DocusignController } from './docusign.controller';

describe('DocusignController', () => {
  let controller: DocusignController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocusignController],
    }).compile();

    controller = module.get<DocusignController>(DocusignController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
