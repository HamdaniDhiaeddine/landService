import { Module } from '@nestjs/common';
import { IpfsService } from './ipfs.service';

@Module({
  providers: [IpfsService],
  exports: [IpfsService], // ✅ Export it so other modules can use it
})
export class IpfsModule {}
