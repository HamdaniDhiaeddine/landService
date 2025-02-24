import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LandsService } from './lands.service';
import { LandsController } from './lands.controller';
import { Land, LandSchema } from './schemas/land.schema';
import { LocationModule } from '../location/location.module';
import { AuthModule } from '../auth/auth.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { IpfsModule } from '../ipfs/ipfs.module'; // ✅ Import IpfsModule

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Land.name, schema: LandSchema }]),
    LocationModule,
    AuthModule,
    EncryptionModule,
    IpfsModule, // ✅ Now LandsModule can use IpfsService
  ],
  controllers: [LandsController],
  providers: [LandsService],
})
export class LandsModule {}
