import { Test, TestingModule } from '@nestjs/testing';
import { DocusignService } from './docusign.service';

describe('DocusignService', () => {
  let service: DocusignService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocusignService],
    }).compile();

    service = module.get<DocusignService>(DocusignService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
