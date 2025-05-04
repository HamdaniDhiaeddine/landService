import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { LocationModule } from './location/location.module';
import { EncryptionModule } from './encryption/encryption.module';
import { IpfsModule } from './ipfs/ipfs.module'; // ✅ Import IpfsModule
import { BlockchainModule } from './blockchain/blockchain.module';

import { LandModule } from './lands/lands.module';
import { DocusignModule } from './docusign/docusign.module';
import { MarketplaceModule } from './marketplace/marketplace.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, 
      envFilePath: '.env'
    }),
    MongooseModule.forRoot(process.env.MONGO_URL),
    LandModule,
    AuthModule,
    LocationModule,
    EncryptionModule,
    IpfsModule,
    BlockchainModule, 
    DocusignModule, 
    MarketplaceModule,
  ],
})
export class AppModule {}
