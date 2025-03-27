import { Module } from '@nestjs/common';
import { BlockchainService } from './services/blockchain.service';
import { ConfigModule } from '@nestjs/config';
import { BlockchainController } from './blockchain.controller';

@Module({
  imports: [
    ConfigModule.forRoot(), 
  ],
  providers: [BlockchainService],
  controllers: [BlockchainController],
  exports: [BlockchainService]
})
export class BlockchainModule {}