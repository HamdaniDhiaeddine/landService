import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DocusignService } from './docusign.service';
import { DocusignController } from './docusign.controller';

@Module({
  imports: [
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
  providers: [DocusignService],
  exports: [DocusignService],
})
export class DocusignModule {}