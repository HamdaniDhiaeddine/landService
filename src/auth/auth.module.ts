import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '10h' },
    }),
  ],
  providers: [JwtStrategy, JwtAuthGuard], // ✅ Provide JwtAuthGuard
  exports: [JwtModule, JwtAuthGuard], // ✅ Export JwtModule and JwtAuthGuard
})
export class AuthModule {}
