import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

@Module({
  providers: [EncryptionService],
  exports: [EncryptionService], // ✅ Export it so other modules can use it
})
export class EncryptionModule {}
