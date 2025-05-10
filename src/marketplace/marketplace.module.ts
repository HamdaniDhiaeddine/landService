import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Land, LandSchema } from 'src/lands/schemas/land.schema';
import { BlockchainModule } from 'src/blockchain/blockchain.module';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { AuthModule } from 'src/auth/auth.module';
import { CacheInvalidationService } from './cache-invalidation.service';
import { CacheRefreshService } from './cache-refresh.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Land.name, schema: LandSchema }]),
    BlockchainModule,
    AuthModule,
  ],
  controllers: [MarketplaceController],
  providers: [
    MarketplaceService,
    CacheInvalidationService,
    CacheRefreshService
],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}