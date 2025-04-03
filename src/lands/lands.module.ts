import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LandService } from './lands.service';
import { LandController } from './lands.controller';
import { Land, LandSchema } from './schemas/land.schema';
import { LocationModule } from '../location/location.module';
import { AuthModule } from '../auth/auth.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { IpfsModule } from '../ipfs/ipfs.module'; // ✅ Import IpfsModule
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { SERVICES } from 'src/constants/service';
import { BlockchainModule } from 'src/blockchain/blockchain.module';
import { RelayerService } from 'src/blockchain/services/relayer.service';
import { Validation, ValidationSchema } from './schemas/validation.schema';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: SERVICES.USER_AUTH,
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('USER_MANAGEMENT_HOST', 'localhost'),
            port: configService.get('USER_MANAGEMENT_PORT', 3001),
          },
        }),
        inject: [ConfigService],
      },
    ]),
    MongooseModule.forFeature([{ name: Land.name, schema: LandSchema }]),
    MongooseModule.forFeature([{ name: Validation.name, schema: ValidationSchema }]),
    LocationModule,
    AuthModule,
    EncryptionModule,
    IpfsModule, 
    BlockchainModule, 
    
  ],
  controllers: [LandController],
  providers: [LandService, RelayerService],

})
export class LandModule {}
