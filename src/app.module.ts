import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { LocationModule } from './location/location.module';
import { EncryptionModule } from './encryption/encryption.module';
import { IpfsModule } from './ipfs/ipfs.module'; // ✅ Import IpfsModule
import { LandModule } from './lands/lands.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRoot(process.env.MONGO_URI),
    LandModule,
    AuthModule,
    LocationModule,
    EncryptionModule,
    IpfsModule, // ✅ Register IpfsModule here
  ],
})
export class AppModule {}
