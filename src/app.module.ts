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


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Rend ConfigModule disponible globalement
      envFilePath: '.env'
    }),
    MongooseModule.forRoot(process.env.MONGO_URI),
    LandModule,
    AuthModule,
    LocationModule,
    EncryptionModule,
    IpfsModule, // ✅ Register IpfsModule here
    BlockchainModule, DocusignModule, // Ajouter cette ligne
  ],
})
export class AppModule {}
