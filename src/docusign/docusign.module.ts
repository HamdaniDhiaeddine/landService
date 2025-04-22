import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DocusignService } from './docusign.service';
import { DocusignController } from './docusign.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { SignatureHistory, SignatureHistorySchema } from './schema/signature-history.schema';
import { SignatureHistoryService } from './signature-history.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SignatureHistory.name, schema: SignatureHistorySchema }
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { 
          expiresIn: '1h',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [DocusignController],
  providers: [DocusignService,SignatureHistoryService],
  exports: [DocusignService,SignatureHistoryService],
})
export class DocusignModule {}