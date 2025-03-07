import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LandService } from './lands.service';
import { LandController } from './lands.controller';
import { Land, LandSchema } from './schemas/land.schema';
import { AuthModule } from 'src/auth/auth.module';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { EncryptionModule } from 'src/encryption/encryption.module';
import { IpfsModule } from 'src/ipfs/ipfs.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Land.name, schema: LandSchema }]),
  AuthModule,
  IpfsModule,
  EncryptionModule,],
  
  controllers: [LandController],
  providers: [LandService, JwtAuthGuard],
})
export class LandModule {}
